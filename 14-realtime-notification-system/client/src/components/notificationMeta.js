import { InfoIcon, CheckCircleIcon, AlertTriangleIcon, XCircleIcon } from "./icons";

const META = {
  info: { color: "var(--accent)", Icon: InfoIcon },
  success: { color: "var(--success)", Icon: CheckCircleIcon },
  warning: { color: "var(--warning)", Icon: AlertTriangleIcon },
  error: { color: "var(--danger)", Icon: XCircleIcon },
};

export function typeMeta(type) {
  return META[type] || META.info;
}
