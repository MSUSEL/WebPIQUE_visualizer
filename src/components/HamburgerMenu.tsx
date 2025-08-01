//component for hamburger menu and it's functionality
import React, { useState, useRef } from 'react';
import Hamburger from 'hamburger-react';
import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import "../styles/HamburgerMenuStyle.css"; //hamburger menu stylesheet

const FileInput = ({
    label,
    onChange,
    inputRef
}: {
    label: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    inputRef: React.RefObject<HTMLInputElement>;
}) => (
    <div className="file-input">
        <label>{label}</label>
        <input
            type="file"
            accept=".json"
            onChange={onChange}
            ref={inputRef}
        />
    </div>
);

const HamburgerMenu = () => {
    const [isOpen, setOpen] = useState(false);
    const [showCompareSubmenu, setShowCompareSubmenu] = useState(false);
    const [activeMenuItem, setActiveMenuItem] = useState<string | null>(null);

    const leftFileRef = useRef<HTMLInputElement>(null);
    const rightFileRef = useRef<HTMLInputElement>(null);

    const handleLeftFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) console.log('Left file selected:', file.name);
    };

    const handleRightFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) console.log('Right file selected:', file.name);
    };

    const navigate = useNavigate();

    const handleNewUpload = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target?.result as string);
                    setOpen(false);
                    navigate('/visualizer', { state: { jsonData: json } });
                } catch (err) {
                    alert('Only JSON files are allowed');
                }
            };
            reader.onerror = () => alert('Error reading file');
            reader.readAsText(file);
        };
        input.click();
    }, [navigate]);

    return (
        <>
            <div className="menu-container">
                <Hamburger toggled={isOpen} toggle={setOpen} size={24} color="#fff" />
                {isOpen && (
                    <div className="menu">
                        <h2 className="menu-title">WebPIQUE Visualizer Menu</h2>
                        <hr />
                        <div className="menu-item" onClick={handleNewUpload}>
                            New File Upload
                        </div>
                        <div
                            className={`menu-item ${activeMenuItem === 'compare' ? 'active' : ''}`}
                            onClick={() => {
                                setShowCompareSubmenu(!showCompareSubmenu);
                                setActiveMenuItem(activeMenuItem === 'compare' ? null : 'compare');
                            }}
                        >
                            Compare
                        </div>
                    </div>
                )}

                {isOpen && showCompareSubmenu && (
                    <div className="submenu">
                        <h3 className="submenu-title">Select Files to Compare</h3>
                        <hr />
                        <FileInput
                            label="Left Side:"
                            onChange={handleLeftFileUpload}
                            inputRef={leftFileRef}
                        />
                        <FileInput
                            label="Right Side:"
                            onChange={handleRightFileUpload}
                            inputRef={rightFileRef}
                        />
                        <button className="compare-button">Compare</button>
                    </div>
                )}
            </div>
        </>
    );
};

export default HamburgerMenu;