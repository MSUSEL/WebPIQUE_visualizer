//component to upload or drag and drop a file
import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";

type Props = {
  onJsonLoaded?: (json: any) => void;
  variant?: "default" | "compact" | "menuItem";
};

const FileUpload: React.FC<Props> = ({ onJsonLoaded, variant = "default" }) => {
  const [status, setStatus] = useState<
    "idle" | "uploading" | "parsing" | "error"
  >("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const navigate = useNavigate();

  // check input schema for correct format
  const GENERIC_SCHEMA_MSG =
    "This file doesn’t match the supported schema. Please refer to the documentation.";

  function validateSchema(root: any): boolean {
    const isObj = (x: any) => x && typeof x === "object" && !Array.isArray(x);

    if (!isObj(root)) return false;

    // must have *either* factors or measures objects
    const hasFactors = isObj((root as any).factors);
    const hasMeasures = isObj((root as any).measures);
    if (!hasFactors && !hasMeasures) return false;

    // if factors exist, require at least one of the known sub-objects
    if (hasFactors) {
      const fa = (root as any).factors;
      const ok =
        isObj(fa.product_factors) || isObj(fa.quality_aspects) || isObj(fa.tqi);
      if (!ok) return false;
    }

    return true;
  }

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];

      if (!file || !file.name.endsWith(".json")) {
        alert("Only JSON files are allowed");
        setStatus("error");
        return;
      }

      setFileName(file.name); // remember the chosen file name
      setStatus("uploading");

      const reader = new FileReader();
      reader.onload = (event) => {
        setStatus("parsing");
        try {
          const json = JSON.parse(event.target?.result as string);

          // input schema validation – show alert and stop if it doesn't match
          if (!validateSchema(json)) {
            alert(GENERIC_SCHEMA_MSG);
            setStatus("error");
            return;
          }

          if (onJsonLoaded) {
            onJsonLoaded({ filename: file.name, data: json });
          } else {
            navigate("/visualizer", { state: { jsonData: json } });
          }
        } catch (e) {
          console.error("Failed to parse JSON:", e);
          alert("Invalid JSON file");
          setStatus("error");
        }
      };

      reader.onerror = () => {
        alert("Error reading file");
        setStatus("error");
      };

      reader.readAsText(file);
    },
    [navigate, onJsonLoaded]
  );

  const { getInputProps, getRootProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { "application/json": [".json"] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  if (variant === "menuItem") {
    return (
      <div
        className="flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-[16px] text-[#333] hover:bg-[#f2f2f2]"
        role="button"
        tabIndex={0}
        onClick={() => open()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") open();
        }}
      >
        <input {...getInputProps()} />
        New File Upload
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2.5">
        <input {...getInputProps()} />
        <span className="opacity-80">File:</span>

        {!fileName ? (
          <button
            type="button"
            className="rounded-[10px] border border-[grey] bg-[#f2f2f2] px-3 py-1.5 text-[14px]"
            onClick={() => open()}
          >
            Upload
          </button>
        ) : (
          // after selection: filename + "Change" (no Upload)
          <>
            <span className="max-w-[180px] truncate">{fileName}</span>
            <button
              type="button"
              className="ml-1 rounded-lg border border-[grey] bg-[#f2f2f2] px-3 py-1.5 text-[14px]"
              onClick={() => open()}
            >
              Change
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`relative z-[1] flex h-full w-full flex-1 items-center justify-center text-center transition-colors duration-200 ${isDragActive ? "bg-[#bebdbd]" : ""
        }`}
    >
      <input {...getInputProps()} />
      <div>
        {isDragActive ? (
          <p className="mb-2 text-[18px]">Drop the JSON file here...</p>
        ) : (
          <p className="mb-2 text-[18px]">
            Drag JSON file here
            <br />
            or
            <br />
            <button
              type="button"
              className="mt-4 rounded-[10px] border border-[grey] bg-[#f2f2f2] px-5 py-2 text-[16px]"
              onClick={() => open()}
            >
              Browse Files
            </button>
          </p>
        )}
      </div>
      {status === "uploading" && (
        <p className="mt-4 text-center font-bold text-[#333]">
          Uploading file...
        </p>
      )}
      {status === "parsing" && (
        <p className="mt-4 text-center font-bold text-[#333]">Parsing file...</p>
      )}
    </div>
  );
};

export default FileUpload;
