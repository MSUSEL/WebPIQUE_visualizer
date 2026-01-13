import CompareComponent from "../components/nonProject/CompareComponent";
import { useLocation } from "react-router-dom";
import type { UploadPayload } from "../components/projectPage/ProjectFileLoad";

const ComparePage = () => {
  const location = useLocation();
  const state = location.state as
    | { file1?: UploadPayload; file2?: UploadPayload }
    | undefined;
  const storedPayload = (() => {
    if (state?.file1 && state?.file2) return state;
    const cached = (globalThis as any).__wpComparePayload as
      | { file1?: UploadPayload; file2?: UploadPayload }
      | undefined;
    if (cached?.file1 && cached?.file2) return cached;
    try {
      const sessionRaw = sessionStorage.getItem("wp_compare_payload_session");
      if (sessionRaw) {
        const parsed = JSON.parse(sessionRaw);
        if (parsed?.file1 && parsed?.file2) return parsed;
      }
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem("wp_compare_payload");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.file1 && parsed?.file2) return parsed;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  })();

  return (
    <main className="flex flex-1 flex-col items-stretch px-0 pt-0">
      <CompareComponent
        file1={storedPayload?.file1}
        file2={storedPayload?.file2}
      />
    </main>
  );
};

export default ComparePage;
