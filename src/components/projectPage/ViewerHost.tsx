// viewer host for post message
import { useEffect, useState } from "react";
import SingleFileComponent from "../nonProject/SingleFileComponent";
import CompareComponent from "../nonProject/CompareComponent";

type UploadPayload = { filename: string; data: any };

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

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const msg = e.data as Msg;
      if (msg?.type === "viewer-payload") {
        if (msg.mode === "single") {
          setMode("single");
          setSingle(msg.file);
        } else {
          setMode("compare");
          setLeft(msg.file1);
          setRight(msg.file2);
        }
      }
    };
    window.addEventListener("message", handler);
    // notify parent we're ready
    window.parent?.postMessage(
      { type: "viewer-ready" },
      window.location.origin
    );
    return () => window.removeEventListener("message", handler);
  }, []);

  if (mode === "single" && single) {
    return <SingleFileComponent jsonData={single} />;
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
  return <div style={{ padding: 24 }}>Waiting for data…</div>;
}
