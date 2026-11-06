import { useMemo, useState } from "react";
import { Topology } from "./components/Topology";
import { TaskBoard } from "./components/TaskBoard";
import { ConfigLab } from "./components/ConfigLab";
import { VerifyTab } from "./components/VerifyTab";
import { QuizTab } from "./components/QuizTab";
import { ExerciseTab } from "./components/ExerciseTab";
import { ImportDialog } from "./components/ImportDialog";
import { buildTasks } from "./data/content";
import {
  Exercise,
  FEATURES,
  accessDevices,
  coreDevice,
  routerDevice,
  tp5Preset,
  validateExercise,
} from "./lib/exercise";
import { buildConfig } from "./lib/generator";
import { validateConfig } from "./lib/validator";
import { useLocalStorage } from "./lib/storage";

type Tab = "topology" | "tasks" | "config" | "verify" | "quiz" | "exercise";

const TABS: { id: Tab; label: string }[] = [
  { id: "topology", label: "Topologie" },
  { id: "tasks", label: "Étapes" },
  { id: "config", label: "Configuration" },
  { id: "verify", label: "Vérification" },
  { id: "quiz", label: "Quiz" },
  { id: "exercise", label: "Exercice" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("topology");
  const [exercise, setExercise] = useLocalStorage<Exercise>(
    "b1m3-exercise-v1",
    tp5Preset(),
  );
  const [configs, setConfigs] = useLocalStorage<Record<string, string>>(
    "b1m3-configs-v2",
    {},
  );
  const [done, setDone] = useLocalStorage<Record<string, boolean>>(
    "b1m3-tasks-v2",
    {},
  );
  const [selected, setSelected] = useState(() => coreDevice(exercise)?.id ?? "");
  const [formKey, setFormKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);

  const activeDevice =
    exercise.devices.find((device) => device.id === selected)?.id ??
    coreDevice(exercise)?.id ??
    exercise.devices[0]?.id ??
    "";

  const tasks = useMemo(() => buildTasks(exercise), [exercise]);
  const taskDone = tasks.filter((task) => done[task.id]).length;

  const report = useMemo(
    () => validateConfig(exercise, activeDevice, configs[activeDevice] ?? ""),
    [exercise, activeDevice, configs],
  );

  const globalScore = useMemo(() => {
    if (exercise.devices.length === 0) return 0;
    const values = exercise.devices.map(
      (device) => validateConfig(exercise, device.id, configs[device.id] ?? "").percent,
    );
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [exercise, configs]);

  const problems = validateExercise(exercise);

  const replaceExercise = (next: Exercise) => {
    setExercise(next);
    setConfigs({});
    setDone({});
    setSelected(coreDevice(next)?.id ?? next.devices[0]?.id ?? "");
    setFormKey((key) => key + 1);
    setTab("topology");
  };

  const toggleTask = (id: string) => {
    setDone((current) => ({ ...current, [id]: !current[id] }));
  };

  const loadAnswer = (deviceId: string) => {
    setConfigs((current) => ({
      ...current,
      [deviceId]: buildConfig(exercise, deviceId),
    }));
    setSelected(deviceId);
    setTab("config");
  };

  const accessCount = accessDevices(exercise).length;
  const router = routerDevice(exercise);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="34" height="34">
              <rect x="2" y="3" width="12" height="10" rx="2.5" />
              <rect x="18" y="3" width="12" height="10" rx="2.5" />
              <rect x="10" y="19" width="12" height="10" rx="2.5" />
              <path d="M8 13v3h16v-3M16 16v3" />
            </svg>
          </span>
          <div>
            <p className="eyebrow">{exercise.module || "Lab Cisco"}</p>
            <h1>{exercise.title}</h1>
            <p className="brand-sub">
              {exercise.description ||
                "Décrivez votre énoncé : topologie, VLANs, adressage et fonctions."}
            </p>
          </div>
        </div>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-value">
              {taskDone}/{tasks.length}
            </span>
            <span className="stat-label">étapes</span>
          </div>
          <div className="stat">
            <span className="stat-value">{globalScore}%</span>
            <span className="stat-label">config</span>
          </div>
          <div className="stat">
            <span className="stat-value">{exercise.vlans.length}</span>
            <span className="stat-label">VLANs</span>
          </div>
        </div>
      </header>

      <div className="meta-bar">
        <span className="meta-chip">
          {coreDevice(exercise)?.hostname ?? "—"} · cœur
        </span>
        {router && (
          <span className="meta-chip ghost">{router.hostname} · routeur</span>
        )}
        <span className="meta-chip">{accessCount} switch(s) d'accès</span>
        <span className="meta-chip">{exercise.devices.length} équipement(s)</span>
        {problems.length > 0 && (
          <span className="meta-chip warn">
            {problems.length} point(s) à corriger
          </span>
        )}
        {FEATURES.filter((feature) => exercise.features[feature.key]).map(
          (feature) => (
            <span key={feature.key} className="meta-chip ghost">
              {feature.label}
            </span>
          ),
        )}
        <button
          type="button"
          className="meta-action"
          onClick={() => setImportOpen(true)}
        >
          ＋ Importer un exercice
        </button>
      </div>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`tab ${tab === entry.id ? "active" : ""}`}
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? "page" : undefined}
          >
            {entry.label}
            {entry.id === "tasks" && (
              <span className="tab-badge">
                {taskDone}/{tasks.length}
              </span>
            )}
            {entry.id === "config" && (
              <span className={`tab-badge ${report.percent === 100 ? "ok" : ""}`}>
                {report.percent}%
              </span>
            )}
            {entry.id === "exercise" && problems.length > 0 && (
              <span className="tab-badge warn">{problems.length}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {tab === "topology" && (
          <Topology
            exercise={exercise}
            selected={activeDevice}
            onSelect={setSelected}
            onConfigure={(id) => {
              setSelected(id);
              setTab("config");
            }}
          />
        )}

        {tab === "tasks" && (
          <TaskBoard
            tasks={tasks}
            done={done}
            onToggle={toggleTask}
            onReset={() => setDone({})}
          />
        )}

        {tab === "config" && (
          <ConfigLab
            exercise={exercise}
            deviceId={activeDevice}
            onDevice={setSelected}
            value={configs[activeDevice] ?? ""}
            onChange={(value) =>
              setConfigs((current) => ({ ...current, [activeDevice]: value }))
            }
            onLoadAnswer={loadAnswer}
          />
        )}

        {tab === "verify" && <VerifyTab exercise={exercise} />}
        {tab === "quiz" && <QuizTab />}
        {tab === "exercise" && (
          <ExerciseTab
            key={formKey}
            exercise={exercise}
            onChange={setExercise}
            onReplace={replaceExercise}
            onOpenImport={() => setImportOpen(true)}
          />
        )}
      </main>

      <footer className="app-footer">
        <span>
          Assistant de lab Cisco — outil de révision indépendant, non officiel.
          Vérifiez toujours sur un vrai équipement ou Packet Tracer.
        </span>
        <button
          type="button"
          className="link-btn"
          onClick={() => setConfigs({})}
        >
          Vider les configurations
        </button>
      </footer>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={replaceExercise}
      />
    </div>
  );
}
