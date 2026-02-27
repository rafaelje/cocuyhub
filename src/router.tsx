import { createMemoryRouter, Navigate } from "react-router-dom";
import { Layout } from "./components/app/Layout";
import { ConfigView } from "./features/config/components/ConfigView";
import { EditorView } from "./features/editor/components/EditorView";
import { ProfilesView } from "./features/profiles/components/ProfilesView";
import { SnapshotsView } from "./features/snapshots/components/SnapshotsView";
import { SettingsView } from "./features/settings/components/SettingsView";
import { ClaudeMetricsView } from "./features/metrics/components/ClaudeMetricsView";
import { SkillsView } from "./features/skills/components/SkillsView";

export const router = createMemoryRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/config" replace /> },
      { path: "config", element: <ConfigView /> },
      { path: "skills", element: <SkillsView /> },
      { path: "editor", element: <EditorView /> },
      { path: "profiles", element: <ProfilesView /> },
      { path: "snapshots", element: <SnapshotsView /> },
      { path: "metrics", element: <ClaudeMetricsView /> },
      { path: "settings", element: <SettingsView /> },
    ],
  },
]);
