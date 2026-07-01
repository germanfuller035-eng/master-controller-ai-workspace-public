package ru.dmitry.matercontroller.feature.pipeline

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import ru.dmitry.matercontroller.core.ui.SectionCard

/**
 * Pipeline hub — entry point to the first Android queue package. Lists the three canonical
 * queues; tapping a card opens its read-only list. No data load here (static routing), so no
 * loading/error state is needed; each queue screen owns its own states.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PipelineHomeScreen(
    onOpenQueue: (String) -> Unit,
) {
    Scaffold(topBar = { TopAppBar(title = { Text("Очереди пайплайна") }) }) { pad ->
        Column(
            Modifier
                .padding(pad)
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
                .testTag("pipeline_home"),
        ) {
            PipelineQueue.entries.forEach { q ->
                SectionCard(
                    title = q.title,
                    subtitle = subtitleFor(q),
                    onClick = { onOpenQueue(q.name) },
                    tag = "pipeline_card_${q.name}",
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Только просмотр. Изменение лидов и отправка отсюда недоступны.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
    }
}

private fun subtitleFor(q: PipelineQueue): String = when (q) {
    PipelineQueue.PRODUCT_ROUTING -> "Без аудируемого сайта → продуктовый маршрут"
    PipelineQueue.STAGING -> "Новые кандидаты Lead Hunter"
    PipelineQueue.VERIFIED_READY -> "Прошли гейт, готовы к аудиту"
}
