import React, { useState } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import SingleFileVisualizer from './SingleFileVisualizer';
import '../styles/Pages.css';
import SplitPane, { Pane } from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css';


const Compare: React.FC = () => {
    const { state } = useLocation() as { state?: { file1?: any; file2?: any } };
    const file1 = state?.file1;
    const file2 = state?.file2;
    if (!file1 || !file2) return <Navigate to="/" replace />; // if user navigates directly without state, bounce to home

    // shared (mirrored) UI state
    const [selectedAspect, setSelectedAspect] = useState<string | null>('Security');
    const [selectedSecurityTab, setSelectedSecurityTab] = useState<'CWE' | 'CVE'>('CWE');

    // resizable pane sizes
    const [sizes, setSizes] = useState([50, 50]);

    const sashRender = (index: number, active: boolean) => (
        <div className='sashRender'
            style={{
                width: '6px',
                height: '90%',
                background: active ? '#999' : '#ccc',
                cursor: 'col-resize',
            }}
        />
    );

    return (
        <div className="app-container">
            <main className="main-content" style={{ height: 'calc(100vh - 140px)' }}>
                <SplitPane split="vertical" sizes={sizes} onChange={setSizes} sashRender={sashRender}>
                    <Pane minSize={260}>
                        <div style={{ height: '100%', overflow: 'auto' }}>
                            <SingleFileVisualizer
                                jsonData={file1}
                                controlledAspect={selectedAspect}
                                onAspectChange={setSelectedAspect}
                                controlledSecurityTab={selectedSecurityTab}
                                onSecurityTabChange={setSelectedSecurityTab}
                            />
                        </div>
                    </Pane>
                    <Pane minSize={260}>
                        <div style={{ height: '100%', overflow: 'auto' }}>
                            <SingleFileVisualizer
                                jsonData={file2}
                                controlledAspect={selectedAspect}
                                onAspectChange={setSelectedAspect}
                                controlledSecurityTab={selectedSecurityTab}
                                onSecurityTabChange={setSelectedSecurityTab}
                            />
                        </div>
                    </Pane>
                </SplitPane>
            </main>
        </div>
    );
};

export default Compare;
