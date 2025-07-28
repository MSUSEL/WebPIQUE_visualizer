//component to upload or drag and drop a file
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import '../styles/FileUpload.css';

const FileUpload = () => {
    const [status, setStatus] = useState<'idle' | 'uploading' | 'parsing' | 'error'>('idle');
    const navigate = useNavigate();

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];

        if (!file || !file.name.endsWith('.json')) {
            alert('Only .json files are allowed');
            setStatus('error');
            return;
        }

        setStatus('uploading');

        const reader = new FileReader();
        reader.onload = (event) => {
            setStatus('parsing');
            try {
                const json = JSON.parse(event.target?.result as string);
                navigate('/visualizer', { state: { jsonData: json } });
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
    }, [navigate]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/json': ['.json'] },
        multiple: false
    });

    return (
        <div className="upload-container">
            <div {...getRootProps()} className="dropzone">
                <input {...getInputProps()} />
                {isDragActive
                    ? <p>Drop the JSON file here...</p>
                    : <p>Drag JSON file here<br />or<br /><button className="upload-button">Browse Files</button></p>}
            </div>

            {status === 'uploading' && <p className="status-msg">Uploading file...</p>}
            {status === 'parsing' && <p className="status-msg">Parsing file...</p>}
            {status === 'error' && <p className="status-msg error">Something went wrong. Please try again.</p>}
        </div>
    );
};

export default FileUpload;

