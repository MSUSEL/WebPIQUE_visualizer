//component to upload or drag and drop a file
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import '../styles/FileUpload.css';

type Props = {
    onJsonLoaded?: (json: any) => void;
    variant: "default" | "compact" | "menuItem";
};

const FileUpload: React.FC<Props> = ({ onJsonLoaded, variant = "default" }) => {
    const [status, setStatus] =
        useState<'idle' | 'uploading' | 'parsing' | 'error'>('idle');
    const [fileName, setFileName] = useState<string | null>(null);
    const navigate = useNavigate();

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];

        if (!file || !file.name.endsWith('.json')) {
            alert('Only JSON files are allowed');
            setStatus('error');
            return;
        }

        setFileName(file.name);   // remember the chosen file name
        setStatus('uploading');

        const reader = new FileReader();
        reader.onload = (event) => {
            setStatus('parsing');
            try {
                const json = JSON.parse(event.target?.result as string);

                if (onJsonLoaded) {
                    onJsonLoaded({ filename: file.name, data: json });
                } else {
                    navigate("/visualizer", { state: { jsonData: json } });
                }
            } catch (e) {
                console.error('Failed to parse JSON:', e);
                alert('Invalid JSON file');
                setStatus('error');
            }
        };

        reader.onerror = () => {
            alert('Error reading file');
            setStatus('error');
        };

        reader.readAsText(file);
    }, [navigate, onJsonLoaded]);

    const { getInputProps, getRootProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: { 'application/json': ['.json'] },
        multiple: false,
        noClick: true,     // don't auto-open on container click
        noKeyboard: true,  // don't open on Enter/Space automatically
    });

    if (variant === "menuItem") {
        return (
            <div
                className="menu-item"
                role="button"
                tabIndex={0}
                onClick={() => open()}                               // <-- call open()
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") open();    // a11y
                }}
            >
                <input {...getInputProps()} />
                New File Upload
            </div>
        );
    }

    if (variant === "compact") {
        return (
            <div className="upload-compact">
                <input {...getInputProps()} />
                <span className="upload-label">File:</span>

                {!fileName ? (
                    // before selection: ONLY "Upload"
                    <button
                        type="button"
                        className="upload-button"
                        onClick={() => open()}                            // <-- call open()
                    >
                        Upload
                    </button>
                ) : (
                    // after selection: filename + "Change" (no Upload)
                    <>
                        <span className="file-name">{fileName}</span>
                        <button
                            type="button"
                            className="upload-button change-button"
                            onClick={() => open()}                          // <-- call open()
                        >
                            Change
                        </button>
                    </>
                )}
            </div>
        );
    }

    return (
        <div {...getRootProps()} className={`upload-container ${isDragActive ? 'drag-active' : ''}`}>
            <input {...getInputProps()} />
            <div className="dropzone">
                {isDragActive ? (
                    <p>Drop the JSON file here...</p>
                ) : (
                    <p>
                        Drag JSON file here
                        <br />
                        or
                        <br />
                        <button
                            type="button"
                            className="upload-button"
                            onClick={() => open()}                           // <-- call open()
                        >
                            Browse Files
                        </button>
                    </p>
                )}
            </div>
            {status === 'uploading' && <p className="status-msg">Uploading file...</p>}
            {status === 'parsing' && <p className="status-msg">Parsing file...</p>}
            {status === 'error' && <p className="status-msg error">Something went wrong. Please try again.</p>}
        </div>
    );
};

export default FileUpload;



