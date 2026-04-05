import { useEffect, useState } from "react";
import type { AdminMetrics } from "../types";

type Props = {
  enabled: boolean;
  onLoadMetrics: (adminKey: string) => Promise<AdminMetrics | null>;
  onAdminAction: (adminKey: string, action: "mute" | "unmute" | "kick", targetUserId: string, durationSeconds?: number) => void;
};

export function AdminPanel({ enabled, onLoadMetrics, onAdminAction }: Props) {
  const [adminKey, setAdminKey] = useState(import.meta.env.VITE_ADMIN_KEY ?? "");
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [targetUserId, setTargetUserId] = useState("");

  useEffect(() => {
    if (!enabled || !adminKey) return;

    let disposed = false;

    const load = async () => {
      const payload = await onLoadMetrics(adminKey);
      if (!disposed) {
        setMetrics(payload);
      }
    };

    load();
    const interval = window.setInterval(load, 4000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [adminKey, enabled, onLoadMetrics]);

  if (!enabled) return null;

  return (
    <section className="admin-panel">
      <h2>Admin Dashboard</h2>
      <input
        value={adminKey}
        onChange={(event) => setAdminKey(event.target.value)}
        placeholder="Admin key"
        className="peer-select"
      />

      {metrics ? (
        <div className="admin-metrics-grid">
          <p>Online: {metrics.usersOnline}</p>
          <p>Connections: {metrics.activeConnections}</p>
          <p>Calls: {metrics.activeCalls}</p>
          <p>Direct Msg: {metrics.directMessagesTotal}</p>
          <p>Topic Msg: {metrics.topicMessagesTotal}</p>
          <p>Muted: {metrics.usersMuted}</p>
          <p>Reports: {metrics.reportsCount}</p>
        </div>
      ) : (
        <p className="admin-empty">No metrics yet. Add valid key.</p>
      )}

      {metrics?.topics?.length ? (
        <div className="admin-topics">
          <h3>Topic Occupancy</h3>
          {metrics.topics.map((topic) => (
            <p key={topic.topicId}>
              {topic.topicName}: {topic.occupancy}
            </p>
          ))}
        </div>
      ) : null}

      {metrics?.reportsPreview?.length ? (
        <div className="admin-reports">
          <h3>Recent Reports</h3>
          {metrics.reportsPreview.map((report) => (
            <p key={report.id}>
              {report.reporterName} reported {report.targetName}: {report.reason}
            </p>
          ))}
        </div>
      ) : null}

      <div className="admin-actions">
        <input
          value={targetUserId}
          onChange={(event) => setTargetUserId(event.target.value)}
          placeholder="Target userId"
          className="peer-select"
        />
        <div className="admin-buttons">
          <button type="button" onClick={() => onAdminAction(adminKey, "mute", targetUserId, 120)}>
            Mute 2m
          </button>
          <button type="button" onClick={() => onAdminAction(adminKey, "unmute", targetUserId)}>
            Unmute
          </button>
          <button type="button" className="off" onClick={() => onAdminAction(adminKey, "kick", targetUserId)}>
            Kick
          </button>
        </div>
      </div>
    </section>
  );
}
