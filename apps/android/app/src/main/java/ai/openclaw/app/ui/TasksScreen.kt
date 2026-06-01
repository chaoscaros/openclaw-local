package ai.openclaw.app.ui

import ai.openclaw.app.GatewayRuntimeTaskSummary
import ai.openclaw.app.GatewayTaskModeItem
import ai.openclaw.app.MainViewModel
import ai.openclaw.app.ui.design.ClawEmptyState
import ai.openclaw.app.ui.design.ClawPrimaryButton
import ai.openclaw.app.ui.design.ClawScaffold
import ai.openclaw.app.ui.design.ClawSecondaryButton
import ai.openclaw.app.ui.design.ClawStatus
import ai.openclaw.app.ui.design.ClawStatusPill
import ai.openclaw.app.ui.design.ClawTheme
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun TasksScreen(
  viewModel: MainViewModel,
  onOpenChat: () -> Unit,
) {
  val isConnected by viewModel.isConnected.collectAsState()
  val summary by viewModel.taskModeSummary.collectAsState()
  val refreshing by viewModel.taskModeRefreshing.collectAsState()
  val errorText by viewModel.taskModeErrorText.collectAsState()
  val chatSessionKey by viewModel.chatSessionKey.collectAsState()
  val sessions by viewModel.chatSessions.collectAsState()
  var showArchived by rememberSaveable { mutableStateOf(false) }
  val currentTaskId = sessions.firstOrNull { it.key == chatSessionKey }?.taskId
  val tasks = if (showArchived) summary.archivedTasks else summary.tasks

  LaunchedEffect(isConnected) {
    if (isConnected) {
      viewModel.refreshTaskMode()
      viewModel.refreshChatSessions(limit = 200)
    }
  }

  ClawScaffold(contentPadding = PaddingValues(start = 20.dp, top = 14.dp, end = 20.dp, bottom = 20.dp)) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      item {
        Row(
          modifier = Modifier.fillMaxWidth(),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
          Text(text = "Tasks", style = ClawTheme.type.display.copy(fontSize = 17.4.sp, lineHeight = 21.sp), color = ClawTheme.colors.text, modifier = Modifier.weight(1f))
          ClawSecondaryButton(text = if (showArchived) "Active" else "Archive", onClick = { showArchived = !showArchived })
          ClawSecondaryButton(text = if (refreshing) "Refreshing" else "Refresh", icon = Icons.Default.Refresh, enabled = isConnected && !refreshing, onClick = viewModel::refreshTaskMode)
        }
      }

      if (errorText != null) {
        item {
          Text(text = errorText.orEmpty(), style = ClawTheme.type.body, color = ClawTheme.colors.danger)
        }
      }

      item {
        TaskSummaryStrip(active = summary.tasks.size, archived = summary.archivedTasks.size, currentTaskId = currentTaskId)
      }

      if (tasks.isEmpty()) {
        item {
          ClawEmptyState(
            title = if (showArchived) "No archived tasks" else "No active tasks",
            body = if (isConnected) "Task mode workspaces will appear here." else "Connect to the gateway to load tasks.",
            action = {
              ClawPrimaryButton(text = "Open Chat", onClick = onOpenChat)
            },
          )
        }
      } else {
        items(tasks, key = { it.id }) { task ->
          TaskCard(
            task = task,
            selected = task.id == currentTaskId,
            onUse = {
              viewModel.setCurrentTaskForSession(task.id)
              onOpenChat()
            },
          )
        }
      }

      item {
        Spacer(modifier = Modifier.height(16.dp))
      }
    }
  }
}

@Composable
private fun TaskSummaryStrip(
  active: Int,
  archived: Int,
  currentTaskId: String?,
) {
  Surface(
    color = ClawTheme.colors.surface,
    shape = RoundedCornerShape(ClawTheme.radii.panel),
    border = BorderStroke(1.dp, ClawTheme.colors.border),
  ) {
    Column(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        ClawStatusPill(text = "$active active", status = if (active > 0) ClawStatus.Success else ClawStatus.Neutral)
        ClawStatusPill(text = "$archived archived", status = ClawStatus.Neutral)
      }
      Text(
        text = currentTaskId?.let { "Current chat task: ${it.take(8)}" } ?: "Current chat has no task binding",
        style = ClawTheme.type.caption,
        color = ClawTheme.colors.textMuted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }
  }
}

@Composable
private fun TaskCard(
  task: GatewayTaskModeItem,
  selected: Boolean,
  onUse: () -> Unit,
) {
  Surface(
    color = ClawTheme.colors.canvas,
    contentColor = ClawTheme.colors.text,
    shape = RoundedCornerShape(ClawTheme.radii.row),
    border = BorderStroke(1.dp, if (selected) ClawTheme.colors.borderStrong else ClawTheme.colors.border),
  ) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(text = task.title, style = ClawTheme.type.section, color = ClawTheme.colors.text, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        ClawStatusPill(text = task.effectiveStatus ?: task.status, status = taskStatus(task))
      }
      task.description?.let {
        Text(text = it, style = ClawTheme.type.body, color = ClawTheme.colors.textMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
      }
      task.nextStep?.let {
        Text(text = "Next: $it", style = ClawTheme.type.body, color = ClawTheme.colors.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
      }
      if (task.todoItems.isNotEmpty()) {
        Text(text = todoSummary(task), style = ClawTheme.type.caption, color = ClawTheme.colors.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
      val runtime = task.runtimeTaskSummaries.firstOrNull()
      if (runtime != null) {
        RuntimeTaskLine(runtime = runtime)
      }
      Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
        ClawSecondaryButton(
          text = if (selected) "Current" else "Use in Chat",
          icon = if (selected) Icons.Outlined.CheckCircle else Icons.Outlined.Inventory2,
          enabled = !selected && !task.archived,
          onClick = onUse,
          modifier = Modifier.heightIn(min = 36.dp),
        )
        task.lastSessionKey?.let {
          Text(text = it, style = ClawTheme.type.caption, color = ClawTheme.colors.textSubtle, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
      }
    }
  }
}

@Composable
private fun RuntimeTaskLine(runtime: GatewayRuntimeTaskSummary) {
  val detail = runtime.error ?: runtime.terminalSummary ?: runtime.progressSummary
  Text(
    text = listOf(runtime.runtime, runtime.status, detail).filterNotNull().joinToString(" · "),
    style = ClawTheme.type.caption,
    color = ClawTheme.colors.textMuted,
    maxLines = 2,
    overflow = TextOverflow.Ellipsis,
  )
}

private fun todoSummary(task: GatewayTaskModeItem): String {
  val total = task.todoItems.size
  val done = task.todoItems.count { it.status == "completed" }
  val running = task.todoItems.count { it.status == "in_progress" }
  return "$done/$total todos complete${if (running > 0) " · $running in progress" else ""}"
}

private fun taskStatus(task: GatewayTaskModeItem): ClawStatus =
  when (task.effectiveStatus ?: task.status) {
    "completed", "ended" -> ClawStatus.Success
    "interrupted" -> ClawStatus.Danger
    "paused" -> ClawStatus.Warning
    else -> when (task.runtimeHealth) {
      "lost" -> ClawStatus.Danger
      "stale", "recovering" -> ClawStatus.Warning
      else -> ClawStatus.Neutral
    }
  }
