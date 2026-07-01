package ru.dmitry.matercontroller

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextReplacement
import org.junit.Rule
import org.junit.Test
import ru.dmitry.matercontroller.core.designsystem.MaterControllerTheme
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner

/**
 * Compose UI tests for shared state components. These run without Hilt/network and
 * verify the loading/error/offline building blocks used by every screen.
 */
class CommonUiTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun loadingStateShows() {
        rule.setContent { MaterControllerTheme { LoadingState() } }
        rule.onNodeWithTag("state_loading").assertIsDisplayed()
    }

    @Test
    fun errorStateShowsMessageAndRetry() {
        var retried = false
        rule.setContent { MaterControllerTheme { ErrorState("Нет соединения", onRetry = { retried = true }) } }
        rule.onNodeWithTag("state_error").assertIsDisplayed()
        rule.onNodeWithText("Нет соединения").assertIsDisplayed()
        rule.onNodeWithTag("btn_retry").assertIsDisplayed()
    }

    @Test
    fun offlineBannerShows() {
        rule.setContent { MaterControllerTheme { OfflineBanner(cachedAt = 0L) } }
        rule.onNodeWithTag("banner_offline").assertIsDisplayed()
    }
}
