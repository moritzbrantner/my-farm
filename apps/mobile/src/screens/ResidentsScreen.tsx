import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import type { CatalogDocument, FarmResponse, ResidentTaskSummaryView } from "@my-farm/contracts";
import {
  residentTaskStatus,
  residentTaskStepLabel,
  residentWork,
  taskLabel,
} from "@my-farm/game-model";
import { ActionButton, Header, ProgressBar } from "../components/ui";
import { styles } from "../styles";
import type { CommandSender, ShellProps } from "../types";
import { formatTile } from "../utils/farm";

export function ResidentsScreen({
  catalog,
  farm,
  message,
  nowMs,
  onNavigate,
  onSendCommand,
}: ShellProps & {
  catalog: CatalogDocument;
  farm: FarmResponse;
  onSendCommand: CommandSender;
}) {
  const view = farm.view;
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Residents" onBack={() => onNavigate("farm")} />
      <Text style={styles.statusText}>{message}</Text>
      {view.residents.map((resident) => {
        const work = residentWork(view, resident.id);
        const selected = resident.id === view.selected_resident_id;
        const status = residentTaskStatus(catalog, view, resident.id, nowMs);
        const location = view.resident_locations[resident.id];
        const futureTasks = work?.queue.filter((task) => task.queue_state === "queued") ?? [];
        return (
          <View key={resident.id} style={styles.panel}>
            <View style={styles.sheetHeader}>
              <Text style={styles.panelTitle}>{resident.display_name}</Text>
              <Text style={styles.badge}>{selected ? "selected" : work?.state ?? "idle"}</Text>
            </View>
            <Text style={styles.bodyText}>Location: {location ? formatTile(location) : "Farmhouse"}</Text>
            <Text style={styles.bodyText}>Current: {status.label}</Text>
            <ProgressBar value={status.progress} />
            {work?.current_step ? (
              <Text style={styles.bodyText}>
                Step: {residentTaskStepLabel(catalog, work.current_step)}
                {work.current_step.target ? ` at ${work.current_step.target.label}` : ""}
              </Text>
            ) : null}
            {work?.block ? <Text style={styles.warningText}>{work.block.message}</Text> : null}
            <CarryState work={work} />
            <View style={styles.inlineActions}>
              <ActionButton
                label="Select"
                onPress={() => onSendCommand({ type: "select_resident", resident_id: resident.id })}
              />
              <ActionButton
                label="Rename"
                onPress={() =>
                  onSendCommand({
                    type: "rename_resident",
                    resident_id: resident.id,
                    display_name: `${resident.display_name}*`,
                  })
                }
              />
            </View>
            {work?.current_task ? (
              <ResidentTaskCard catalog={catalog} task={work.current_task} />
            ) : null}
            {futureTasks.map((task, index) => (
              <ResidentTaskCard
                key={task.id}
                catalog={catalog}
                task={task}
                actions={
                  <View style={styles.inlineActions}>
                    <ActionButton
                      label="Up"
                      disabled={index === 0}
                      onPress={() =>
                        onSendCommand({
                          type: "reorder_resident_task",
                          resident_id: resident.id,
                          task_id: task.id,
                          before_task_id: futureTasks[index - 1]?.id,
                        })
                      }
                    />
                    <ActionButton
                      label="Down"
                      disabled={index === futureTasks.length - 1}
                      onPress={() =>
                        onSendCommand({
                          type: "reorder_resident_task",
                          resident_id: resident.id,
                          task_id: task.id,
                          before_task_id: futureTasks[index + 2]?.id,
                        })
                      }
                    />
                  </View>
                }
              />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

function CarryState({
  work,
}: {
  work: ReturnType<typeof residentWork>;
}) {
  const items = work?.carry.items ?? [];
  const tools = work?.carry.tools ?? [];
  if (items.length === 0 && tools.length === 0) {
    return <Text style={styles.mutedText}>Resident Inventory: empty</Text>;
  }
  return (
    <View style={styles.subPanel}>
      <Text style={styles.bodyText}>Resident Inventory</Text>
      {items.map((item) => (
        <Text key={item.item_id} style={styles.mutedText}>
          {item.name} x{item.quantity}
        </Text>
      ))}
      {tools.map((tool) => (
        <Text key={tool.tool_kind} style={styles.mutedText}>
          {tool.label} x{tool.quantity}
        </Text>
      ))}
    </View>
  );
}

function ResidentTaskCard({
  catalog,
  task,
  actions,
}: {
  catalog: CatalogDocument;
  task: ResidentTaskSummaryView;
  actions?: ReactNode;
}) {
  return (
    <View style={styles.subPanel}>
      <Text style={styles.bodyText}>{taskLabel(catalog, task)}</Text>
      <Text style={styles.mutedText}>
        {task.queue_state} - {task.step_count} steps
      </Text>
      {task.preview.target ? (
        <Text style={styles.mutedText}>Target: {task.preview.target.label}</Text>
      ) : null}
      {task.preview.path.length > 0 ? (
        <Text style={styles.mutedText}>
          Resident Task Preview: {task.preview.path.map((tile) => formatTile(tile)).join(" -> ")}
        </Text>
      ) : null}
      {actions}
    </View>
  );
}
