import { Task } from "../data/content";
import { CodeBlock } from "./ui";

export function TaskBoard({
  tasks,
  done,
  onToggle,
  onReset,
}: {
  tasks: Task[];
  done: Record<string, boolean>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const completed = tasks.filter((task) => done[task.id]).length;
  const percent = Math.round((completed / tasks.length) * 100);

  return (
    <div className="stack">
      <div className="panel progress-panel">
        <div>
          <p className="eyebrow">Feuille de route</p>
          <h2>
            {completed} / {tasks.length} étapes validées
          </h2>
          <p className="muted small">
            Cochez une étape quand vous l'avez tapée sur le switch. La progression
            est enregistrée dans ce navigateur.
          </p>
        </div>
        <div className="progress-wrap">
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="progress-value">{percent}%</span>
          <button type="button" className="btn ghost small" onClick={onReset}>
            Réinitialiser
          </button>
        </div>
      </div>

      <ol className="task-list">
        {tasks.map((task, index) => {
          const checked = !!done[task.id];
          return (
            <li
              key={task.id}
              className={`task-card ${checked ? "done" : ""}`}
            >
              <button
                type="button"
                className="task-check"
                aria-pressed={checked}
                aria-label={checked ? "Marquer comme non faite" : "Marquer comme faite"}
                onClick={() => onToggle(task.id)}
              >
                {checked ? "✓" : String(index).padStart(2, "0")}
              </button>
              <div className="task-body">
                <h3>{task.title}</h3>
                <p className="task-goal">{task.goal}</p>
                {task.commands.length > 0 && (
                  <CodeBlock lines={task.commands.join("\n")} />
                )}
                {task.tip && (
                  <p className="task-tip">
                    <span>Astuce</span> {task.tip}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
