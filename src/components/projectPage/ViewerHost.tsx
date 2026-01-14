// viewer host for post message
import { useEffect, useState } from "react";
import SingleFileComponent from "../nonProject/SingleFileComponent";
import CompareComponent from "../nonProject/CompareComponent";

type UploadPayload = { filename: string; data: any };
const SINGLE_PAYLOAD_KEY = "wp_single_payload";
const COMPARE_PAYLOAD_KEY = "wp_compare_payload";
const COMPARE_PAYLOAD_SESSION_KEY = "wp_compare_payload_session";

type Msg =
  | { type: "viewer-payload"; mode: "single"; file?: UploadPayload }
  | {
      type: "viewer-payload";
      mode: "compare";
      file1?: UploadPayload;
      file2?: UploadPayload;
    };

export default function ViewerHost() {
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [single, setSingle] = useState<UploadPayload | undefined>(undefined);
  const [left, setLeft] = useState<UploadPayload | undefined>(undefined);
  const [right, setRight] = useState<UploadPayload | undefined>(undefined);

  const loadSingleFromStorage = () => {
    try {
      const raw = localStorage.getItem(SINGLE_PAYLOAD_KEY);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      return parsed?.data ? parsed : undefined;
    } catch {
      return undefined;
    }
  };

  const loadCompareFromStorage = () => {
    try {
      const sessionRaw = sessionStorage.getItem(COMPARE_PAYLOAD_SESSION_KEY);
      if (sessionRaw) {
        const parsed = JSON.parse(sessionRaw);
        if (parsed?.file1 && parsed?.file2) return parsed;
      }
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem(COMPARE_PAYLOAD_KEY);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      if (parsed?.file1 && parsed?.file2) return parsed;
    } catch {
      /* ignore */
    }
    return undefined;
  };

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const msg = e.data as Msg;
      if (msg?.type === "viewer-payload") {
        if (msg.mode === "single") {
          setMode("single");
          if (msg.file) {
            setSingle(msg.file);
          } else {
            const stored = loadSingleFromStorage();
            if (stored) setSingle(stored);
          }
        } else {
          setMode("compare");
          if (msg.file1 && msg.file2) {
            setLeft(msg.file1);
            setRight(msg.file2);
          } else {
            const stored = loadCompareFromStorage();
            if (stored?.file1 && stored?.file2) {
              setLeft(stored.file1);
              setRight(stored.file2);
            }
          }
        }
      }
    };
    window.addEventListener("message", handler);
    // notify parent we're ready
    window.parent?.postMessage(
      { type: "viewer-ready" },
      window.location.origin
    );
    const initialCompare = loadCompareFromStorage();
    if (initialCompare?.file1 && initialCompare?.file2) {
      setMode("compare");
      setLeft(initialCompare.file1);
      setRight(initialCompare.file2);
    } else {
      const initialSingle = loadSingleFromStorage();
      if (initialSingle) {
        setMode("single");
        setSingle(initialSingle);
      }
    }
    return () => window.removeEventListener("message", handler);
  }, []);

  if (mode === "single" && single) {
    return <SingleFileComponent jsonData={single} embedded />;
  }
  if (mode === "compare" && left && right) {
    return (
      <CompareComponent
        file1={left}
        file2={right}
        embedded
        initialSizes={[50, 50]}
      />
    );
  }
  // idle state while parent sends data
  return <div className="p-6">Waiting for data…</div>;
}

