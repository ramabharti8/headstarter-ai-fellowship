import { typeMeta } from "./notificationMeta";
import { CloseIcon } from "./icons";

export default function NotificationPopupStack({ popups, onDismiss }) {
  return (
    <div className="popup-stack">
      {popups.map((p) => {
        const meta = typeMeta(p.type);
        return (
          <div key={p.popupId} className="popup-card" style={{ borderLeftColor: meta.color }}>
            <span className="popup-icon" style={{ color: meta.color }}>
              <meta.Icon width={18} height={18} />
            </span>
            <div className="popup-body">
              <div className="popup-title">{p.title}</div>
              <div className="popup-message">{p.message}</div>
            </div>
            <button className="popup-close" onClick={() => onDismiss(p.popupId)}>
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
