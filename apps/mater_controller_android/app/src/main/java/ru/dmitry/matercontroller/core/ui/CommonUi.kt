package ru.dmitry.matercontroller.core.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

object OwnerSpacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
    val command = 56.dp
}

enum class OwnerStatusTone { Safe, Attention, Critical, Neutral, Offline, NoSend }

data class OwnerSafetyInvariant(
    val label: String,
    val value: String,
    val tone: OwnerStatusTone = OwnerStatusTone.Safe,
    val detail: String? = null,
)

@Composable
fun LoadingState(modifier: Modifier = Modifier, message: String = "Загрузка данных") {
    Box(modifier.fillMaxSize().testTag("state_loading"), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Spacer(Modifier.height(OwnerSpacing.md))
            Text(message, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
            Spacer(Modifier.height(OwnerSpacing.xs))
            Text(
                "Если сервер недоступен, будет показан кэш или понятная ошибка.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.68f),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = OwnerSpacing.xl),
            )
        }
    }
}

@Composable
fun ErrorState(
    message: String,
    onRetry: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    nextAction: String = "Проверьте соединение и повторите попытку.",
) {
    Column(
        modifier.fillMaxSize().padding(24.dp).testTag("state_error"),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        OwnerStatusChip("Требуется внимание", OwnerStatusTone.Critical)
        Spacer(Modifier.height(8.dp))
        Text(ownerSafeErrorMessage(message), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            nextAction,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.72f),
        )
        if (onRetry != null) {
            Spacer(Modifier.height(16.dp))
            Button(onClick = onRetry, modifier = Modifier.heightIn(min = OwnerSpacing.command).testTag("btn_retry")) { Text("Повторить") }
        }
    }
}

private fun ownerSafeErrorMessage(message: String): String {
    val raw = message.trim()
    val low = raw.lowercase()
    return when {
        raw.isBlank() -> "Не удалось загрузить данные."
        "failed to connect" in low ||
            "127.0.0.1" in low ||
            "localhost" in low ||
            "java.net" in low ||
            "unknownhost" in low ||
            "connectexception" in low -> "Нет соединения с рабочим сервером."
        raw.startsWith("http://") ||
            raw.startsWith("https://") ||
            "sslip.io" in low -> "Сервер сейчас недоступен."
        "api" in low -> raw.replace("API", "сервер", ignoreCase = true)
        else -> raw
    }
}

@Composable
fun EmptyState(
    message: String = "Нет данных",
    modifier: Modifier = Modifier,
    nextAction: String = "Это нормальное состояние. Новые записи появятся после обновления данных.",
) {
    Box(modifier.fillMaxSize().padding(24.dp).testTag("state_empty"), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            OwnerStatusChip("Пусто", OwnerStatusTone.Neutral)
            Spacer(Modifier.height(8.dp))
            Text(message, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text(
                nextAction,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.68f),
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
fun OfflineBanner(cachedAt: Long?, modifier: Modifier = Modifier) {
    val time = cachedAt?.let { java.text.SimpleDateFormat("dd.MM HH:mm", java.util.Locale.getDefault()).format(java.util.Date(it)) } ?: "—"
    Surface(color = MaterialTheme.colorScheme.tertiaryContainer, modifier = modifier.fillMaxWidth().testTag("banner_offline")) {
        Text(
            "Данные не обновились. Показан снимок от $time. Нажмите «Обновить».",
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onTertiaryContainer,
        )
    }
}

@Composable
fun SectionCard(title: String, subtitle: String? = null, onClick: (() -> Unit)? = null, tag: String = "", trailing: String? = null) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).then(if (tag.isNotEmpty()) Modifier.testTag(tag) else Modifier),
        onClick = { onClick?.invoke() },
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                if (subtitle != null) {
                    Spacer(Modifier.height(2.dp))
                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                }
            }
            if (trailing != null) Text(trailing, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
fun OwnerStatusChip(label: String, tone: OwnerStatusTone = OwnerStatusTone.Neutral, tag: String = "") {
    val colors = ownerToneColors(tone)
    Surface(
        color = colors.first,
        contentColor = colors.second,
        shape = MaterialTheme.shapes.small,
        modifier = if (tag.isNotBlank()) Modifier.testTag(tag) else Modifier,
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = OwnerSpacing.md, vertical = OwnerSpacing.xs),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
fun PilotSafetyChips(
    modifier: Modifier = Modifier,
    tag: String = "pilot_safety_chips",
) {
    Column(
        modifier.then(if (tag.isNotBlank()) Modifier.testTag(tag) else Modifier),
        verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            OwnerStatusChip("ручная отправка", OwnerStatusTone.Safe)
            OwnerStatusChip("без платежей", OwnerStatusTone.Safe)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            OwnerStatusChip("локальная фиксация", OwnerStatusTone.Safe)
        }
    }
}

@Composable
fun SafetyInvariantPanel(
    items: List<OwnerSafetyInvariant>,
    modifier: Modifier = Modifier,
    title: String = "Контур безопасности",
    subtitle: String? = null,
    tag: String = "owner_safety_invariant_panel",
) {
    Card(
        modifier = modifier.fillMaxWidth().padding(vertical = OwnerSpacing.sm).testTag(tag),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (subtitle != null) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f),
                )
            }
            items.forEach { item ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(item.label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                        item.detail?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.76f),
                            )
                        }
                    }
                    Spacer(Modifier.width(OwnerSpacing.md))
                    OwnerStatusChip(item.value, item.tone)
                }
            }
        }
    }
}

@Composable
fun ContractOnlyPanel(
    items: List<String>,
    modifier: Modifier = Modifier,
    title: String = "Что сейчас недоступно в приложении",
    tag: String = "contract_only_panel",
) {
    Card(
        modifier = modifier.fillMaxWidth().padding(vertical = OwnerSpacing.sm).testTag(tag),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip("опасные действия выключены", OwnerStatusTone.Attention)
            }
            items.forEach { item ->
                Text(
                    "- $item",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.76f),
                )
            }
        }
    }
}

@Composable
fun RiskBadge(level: String, label: String, tag: String = "") {
    val tone = when (level.uppercase()) {
        "R0", "R1" -> OwnerStatusTone.Safe
        "R2", "R3" -> OwnerStatusTone.Attention
        "R4", "R5" -> OwnerStatusTone.Critical
        else -> OwnerStatusTone.Neutral
    }
    val colors = ownerToneColors(tone)
    Surface(
        color = colors.first,
        contentColor = colors.second,
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, colors.second.copy(alpha = 0.28f)),
        modifier = if (tag.isNotBlank()) Modifier.testTag(tag) else Modifier,
    ) {
        Row(Modifier.padding(horizontal = OwnerSpacing.md, vertical = OwnerSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
            Text(level.uppercase(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(OwnerSpacing.sm))
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
fun OwnerActionCard(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    tag: String = "",
    status: String? = null,
    tone: OwnerStatusTone = OwnerStatusTone.Neutral,
    trailing: String? = null,
    onClick: (() -> Unit)? = null,
) {
    Card(
        modifier = modifier.fillMaxWidth().padding(vertical = OwnerSpacing.xs)
            .then(if (tag.isNotBlank()) Modifier.testTag(tag) else Modifier)
            .heightIn(min = OwnerSpacing.command),
        onClick = { onClick?.invoke() },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(Modifier.padding(OwnerSpacing.lg), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                ) {
                    Text(
                        title,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                    )
                    if (status != null) {
                        OwnerStatusChip(status, tone)
                    }
                }
                Spacer(Modifier.height(OwnerSpacing.xs))
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.72f))
            }
            if (trailing != null) {
                Spacer(Modifier.width(OwnerSpacing.md))
                Text(trailing, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
fun ApprovalRiskCard(
    title: String,
    riskLevel: String,
    riskLabel: String,
    whatChanges: String,
    whatDoesNotHappen: String,
    nextStep: String,
    modifier: Modifier = Modifier,
    tag: String = "approval_risk_card",
) {
    Card(modifier = modifier.fillMaxWidth().padding(vertical = OwnerSpacing.sm).testTag(tag)) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                RiskBadge(riskLevel, riskLabel)
            }
            Text("Что изменится: $whatChanges", style = MaterialTheme.typography.bodySmall)
            Text("Чего не произойдёт: $whatDoesNotHappen", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            Text("Дальше: $nextStep", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.72f))
        }
    }
}

@Composable
fun IncidentCard(title: String, subtitle: String, severity: String, modifier: Modifier = Modifier, tag: String = "") {
    Card(
        modifier = modifier.fillMaxWidth().padding(vertical = OwnerSpacing.xs)
            .then(if (tag.isNotBlank()) Modifier.testTag(tag) else Modifier),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg)) {
            RiskBadge(severity, "критический контекст")
            Spacer(Modifier.height(OwnerSpacing.sm))
            Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onErrorContainer)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.78f))
        }
    }
}

@Composable
fun EvidenceRollbackBlock(evidence: String, rollback: String, modifier: Modifier = Modifier, tag: String = "evidence_rollback_block") {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.medium,
        modifier = modifier.fillMaxWidth().testTag(tag),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Text("Доказательства", style = MaterialTheme.typography.labelLarge)
            Text(evidence, style = MaterialTheme.typography.bodySmall)
            Divider(Modifier.padding(vertical = OwnerSpacing.xs))
            Text("Откат", style = MaterialTheme.typography.labelLarge)
            Text(rollback, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun PrimaryBottomAction(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, tag: String = "primary_bottom_action") {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().heightIn(min = OwnerSpacing.command).testTag(tag),
    ) {
        Text(label)
    }
}

@Composable
fun OwnerStopComponent(
    modifier: Modifier = Modifier,
    status: String = "Глобальная остановка доступна из системного контура.",
    tag: String = "owner_stop_component",
) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        shape = MaterialTheme.shapes.medium,
        modifier = modifier.fillMaxWidth().testTag(tag),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("STOP", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                RiskBadge("R5", "критическое")
            }
            Text(status, style = MaterialTheme.typography.bodyMedium)
            Text(
                "Эта карточка сама не меняет серверную часть. Она показывает владельцу критический контекст остановки.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun ownerToneColors(tone: OwnerStatusTone): Pair<Color, Color> = when (tone) {
    OwnerStatusTone.Safe -> MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.onSecondaryContainer
    OwnerStatusTone.Attention -> MaterialTheme.colorScheme.tertiaryContainer to MaterialTheme.colorScheme.onTertiaryContainer
    OwnerStatusTone.Critical -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
    OwnerStatusTone.Offline -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
    OwnerStatusTone.NoSend -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
    OwnerStatusTone.Neutral -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
}
