package ru.dmitry.matercontroller.feature.sales

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object WorkingSalesSiteAnalyzer {
    private val client = OkHttpClient.Builder()
        .callTimeout(14, TimeUnit.SECONDS)
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    suspend fun analyze(site: String): ManualLeadInput = withContext(Dispatchers.IO) {
        val fallback = WorkingSalesMvpEngine.analyzeWebsite(site)
        if (fallback.websiteOrDomain.isBlank()) return@withContext fallback

        runCatching {
            val fetched = fetchFirstAvailable(site)
            analyzeFetchedHtml(site, fetched.finalUrl, fetched.html)
        }.getOrElse { error ->
            fallback.copy(
                sourceConfidence = "низкая",
                productsServices = emptyList(),
                contact = "",
                contactChannel = "",
                contactSourceUrl = "",
                evidence = "Сайт введён владельцем; страница не была разобрана: ${error.safeMessage()}",
                notes = "Автоматический разбор сайта не завершился. Система не выдумывает услуги или контакты; проверьте сайт вручную.",
            )
        }
    }

    fun analyzeFetchedHtml(inputSite: String, finalUrl: String, html: String): ManualLeadInput {
        val fallback = WorkingSalesMvpEngine.analyzeWebsite(inputSite)
        if (fallback.websiteOrDomain.isBlank()) return fallback

        val title = extractTitle(html)
        val description = extractMeta(html, setOf("description", "og:description")).firstOrNull().orEmpty()
        val headings = extractHeadings(html)
        val text = plainText(html)
        val products = extractProducts(title, description, headings, text)
        val contactLink = extractContactLink(finalUrl, html)
        val email = extractEmail(html)
        val phone = extractPhone(text)
        val company = companyFromTitle(title).ifBlank { fallback.companyName }
        val contact = when {
            email.isNotBlank() -> email
            phone.isNotBlank() -> phone
            contactLink.isNotBlank() -> "страница контактов"
            else -> ""
        }
        val contactChannel = when {
            email.isNotBlank() -> "email с сайта"
            phone.isNotBlank() -> "телефон с сайта"
            contactLink.isNotBlank() -> "страница контактов"
            else -> ""
        }
        val confidence = when {
            products.isNotEmpty() && contact.isNotBlank() -> "высокая"
            title.isNotBlank() && products.isNotEmpty() -> "средняя"
            else -> "низкая"
        }
        val evidence = buildList {
            if (title.isNotBlank()) add("Заголовок сайта: $title")
            if (description.isNotBlank()) add("Описание сайта: $description")
            products.forEach { add("Услуга с сайта: $it") }
            if (contactLink.isNotBlank()) add("Контактная страница: $contactLink")
            if (contactChannel.isNotBlank()) add("Контактный канал найден: $contactChannel")
        }.ifEmpty {
            listOf("Главная страница загружена, но полезные факты не выделены")
        }

        return fallback.copy(
            companyName = company,
            contact = contact,
            niche = inferNiche(title, description, headings, text).ifBlank { fallback.niche },
            region = extractRegion(text).ifBlank { fallback.region },
            productsServices = products,
            sourceUrl = finalUrl,
            contactSourceUrl = contactLink,
            evidence = evidence.joinToString("; "),
            leadSource = "разбор сайта, введённого владельцем",
            sourceConfidence = confidence,
            contactChannel = contactChannel,
            problemHints = problemHints(products, contactChannel),
            notes = "Разбор выполнен по фактам главной страницы. Если услуга или контакт не найдены в тексте сайта, система не подставляет шаблон.",
        )
    }

    private data class FetchedSite(val finalUrl: String, val html: String)

    private fun fetchFirstAvailable(site: String): FetchedSite {
        val candidates = candidateUrls(site)
        var lastError: Throwable? = null
        for (url in candidates) {
            try {
                val request = Request.Builder()
                    .url(url)
                    .header("User-Agent", "Mozilla/5.0 MasterControllerOwnerApp")
                    .get()
                    .build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) error("Сайт вернул статус ${response.code}")
                    val body = response.body?.string().orEmpty()
                    if (body.isBlank()) error("Сайт вернул пустую страницу")
                    return FetchedSite(response.request.url.toString(), body.take(MAX_HTML_CHARS))
                }
            } catch (error: Throwable) {
                lastError = error
            }
        }
        throw lastError ?: IllegalStateException("Сайт не ответил")
    }

    private fun candidateUrls(site: String): List<String> {
        val trimmed = site.trim()
        if (trimmed.startsWith("http://", ignoreCase = true) || trimmed.startsWith("https://", ignoreCase = true)) {
            return listOf(trimmed)
        }
        val domain = trimmed
            .removePrefix("www.")
            .substringBefore("/")
            .substringBefore("?")
            .trim()
        return listOf("https://$domain/", "http://$domain/")
    }

    private fun extractTitle(html: String): String = Regex(
        """<title[^>]*>(.*?)</title>""",
        setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
    ).find(html)?.groupValues?.get(1).orEmpty().cleanHtmlText()

    private fun extractMeta(html: String, names: Set<String>): List<String> {
        return Regex("""<meta\b[^>]*>""", RegexOption.IGNORE_CASE)
            .findAll(html)
            .map { it.value }
            .filter { tag ->
                names.any { name ->
                    tag.contains("""name="$name"""", ignoreCase = true) ||
                        tag.contains("""name='$name'""", ignoreCase = true) ||
                        tag.contains("""property="$name"""", ignoreCase = true) ||
                        tag.contains("""property='$name'""", ignoreCase = true)
                }
            }
            .mapNotNull { tag -> attr(tag, "content")?.cleanHtmlText() }
            .filter { it.isNotBlank() }
            .distinct()
            .take(3)
            .toList()
    }

    private fun extractHeadings(html: String): List<String> {
        return Regex(
            """<h[1-3]\b[^>]*>(.*?)</h[1-3]>""",
            setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        ).findAll(html)
            .map { it.groupValues[1].cleanHtmlText() }
            .filter { it.length in 4..90 }
            .distinct()
            .take(20)
            .toList()
    }

    private fun extractProducts(title: String, description: String, headings: List<String>, text: String): List<String> {
        val fromHeadings = headings
            .filter { heading -> serviceKeywords.any { it in heading.lowercase() } }
            .filterNot { heading -> genericNavigation.any { it in heading.lowercase() } }
            .take(6)
        if (fromHeadings.isNotEmpty()) return fromHeadings

        val combined = listOf(title, description, text.take(4000)).joinToString(" ").lowercase()
        val dictionary = listOf(
            "демонтаж зданий",
            "разработка котлованов",
            "аренда техники",
            "строительная компания",
            "строительные работы",
            "проектирование",
            "ремонт",
            "монтаж",
        )
        return dictionary.filter { it in combined }.take(4)
    }

    private fun extractContactLink(finalUrl: String, html: String): String {
        val links = Regex(
            """<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)</a>""",
            setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        ).findAll(html)
            .map { match -> match.groupValues[1] to match.groupValues[2].cleanHtmlText() }
            .filter { (href, label) ->
                val combined = "$href $label".lowercase()
                contactKeywords.any { it in combined }
            }
            .toList()
        return links.firstOrNull()?.first?.let { absolutize(finalUrl, it) }.orEmpty()
    }

    private fun extractEmail(html: String): String {
        return Regex("""[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}""", RegexOption.IGNORE_CASE)
            .find(html)
            ?.value
            .orEmpty()
    }

    private fun extractPhone(text: String): String {
        return Regex("""(?:\+7|8)\s?[\( -]?\d{3}[\) -]?\s?\d{3}[- ]?\d{2}[- ]?\d{2}""")
            .find(text)
            ?.value
            .orEmpty()
    }

    private fun inferNiche(title: String, description: String, headings: List<String>, text: String): String {
        val combined = listOf(title, description, headings.joinToString(" "), text.take(4000)).joinToString(" ").lowercase()
        return when {
            listOf("демонтаж", "котлован", "аренда техники", "строитель").any { it in combined } -> "строительство / спецтехника"
            listOf("бетон", "жби", "стройматериал").any { it in combined } -> "строительство / материалы"
            listOf("производство", "завод").any { it in combined } -> "производство"
            else -> ""
        }
    }

    private fun extractRegion(text: String): String {
        val lower = text.lowercase()
        return listOf(
            "Краснодар",
            "Москва",
            "Санкт-Петербург",
            "Ростов",
            "Казань",
            "Екатеринбург",
            "Новосибирск",
        ).firstOrNull { it.lowercase() in lower }.orEmpty()
    }

    private fun problemHints(products: List<String>, contactChannel: String): String {
        val productLine = if (products.isEmpty()) {
            "на главной странице не удалось уверенно выделить услуги"
        } else {
            "на сайте найдены направления: ${products.joinToString(", ")}"
        }
        val contactLine = if (contactChannel.isBlank()) {
            "контактный путь нужно проверить вручную"
        } else {
            "контактный путь найден: $contactChannel"
        }
        return "$productLine; $contactLine; первое касание должно ссылаться только на найденные факты"
    }

    private fun companyFromTitle(title: String): String {
        return title
            .replace(Regex("""\s+[|—-]\s+.*$"""), "")
            .replace(Regex("""\s+(строительная компания|официальный сайт)\s*$""", RegexOption.IGNORE_CASE), "")
            .trim()
    }

    private fun plainText(html: String): String = html
        .replace(Regex("""<script\b.*?</script>""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL)), " ")
        .replace(Regex("""<style\b.*?</style>""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL)), " ")
        .replace(Regex("""<[^>]+>"""), " ")
        .cleanHtmlText()

    private fun attr(tag: String, name: String): String? {
        return Regex("""\b$name\s*=\s*["']([^"']*)["']""", RegexOption.IGNORE_CASE)
            .find(tag)
            ?.groupValues
            ?.get(1)
    }

    private fun absolutize(finalUrl: String, href: String): String {
        if (href.startsWith("http://", ignoreCase = true) || href.startsWith("https://", ignoreCase = true)) return href
        val base = Regex("""^(https?://[^/]+)""", RegexOption.IGNORE_CASE).find(finalUrl)?.value.orEmpty()
        return when {
            base.isBlank() -> href
            href.startsWith("/") -> "$base$href"
            else -> "$base/$href"
        }
    }

    private fun String.cleanHtmlText(): String = this
        .replace(Regex("""<[^>]+>"""), " ")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&laquo;", "«")
        .replace("&raquo;", "»")
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
        .replace(Regex("""\s+"""), " ")
        .trim()

    private fun Throwable.safeMessage(): String = message
        ?.replace(Regex("""[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}""", RegexOption.IGNORE_CASE), "[email скрыт]")
        ?.take(120)
        ?: "нет ответа"

    private val serviceKeywords = listOf(
        "демонтаж",
        "котлован",
        "аренда",
        "техник",
        "строитель",
        "монтаж",
        "ремонт",
        "проект",
        "поставка",
        "производ",
        "бетон",
        "жби",
    )

    private val genericNavigation = listOf(
        "главная",
        "контакты",
        "о компании",
        "политика",
        "новости",
        "акции",
    )

    private val contactKeywords = listOf(
        "contact",
        "kontakt",
        "kontakty",
        "contacts",
        "контакт",
        "связаться",
        "обратная связь",
    )

    private const val MAX_HTML_CHARS = 450_000
}
