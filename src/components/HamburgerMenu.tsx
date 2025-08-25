//component for hamburger menu and it's functionality
import React, { useState } from "react";
import Hamburger from "hamburger-react";
import { useNavigate } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import "../styles/HamburgerMenuStyle.css"; // hamburger menu stylesheet

type UploadPayload = { filename: string; data: any };

const HamburgerMenu: React.FC = () => {
  const [isOpen, setOpen] = useState(false);
  const [showCompareSubmenu, setShowCompareSubmenu] = useState(false);
  const [leftJson, setLeftJson] = useState<UploadPayload | null>(null);
  const [rightJson, setRightJson] = useState<UploadPayload | null>(null);

  const navigate = useNavigate();

  const handleCompare = () => {
    if (!leftJson || !rightJson) return;
    setOpen(false);
    setShowCompareSubmenu(false);
    navigate("/compare", { state: { file1: leftJson, file2: rightJson } });
  };

  return (
    <div className="menu-container">
      <div className="hamburger-container">
        <Hamburger toggled={isOpen} toggle={setOpen} size={22} />
      </div>

      {isOpen && (
        <div className="menu">
          <h2 className="menu-title">WebPIQUE Visualizer Menu</h2>
          <hr />

          {/* Single-file upload as a menu item */}
          <FileUpload
            variant="menuItem"
            onJsonLoaded={({ filename, data }: UploadPayload) => {
              setOpen(false);
              navigate("/visualizer", { state: { jsonData: data, filename } });
            }}
          />

          {/* Toggle compare submenu */}
          <div
            className={`menu-item ${showCompareSubmenu ? "active" : ""}`}
            onClick={() => setShowCompareSubmenu((v) => !v)}
          >
            Compare
          </div>
        </div>
      )}

      {/* Compare submenu: two compact uploaders + Compare button */}
      {isOpen && showCompareSubmenu && (
        <div className="submenu">
          <h3 className="submenu-title">Select Files to Compare</h3>
          <hr />
          <div className="file-input">
            <label>Left Side:</label>
            <FileUpload
              variant="compact"
              onJsonLoaded={(payload: UploadPayload) => setLeftJson(payload)}
            />
          </div>
          <div className="file-input">
            <label>Right Side:</label>
            <FileUpload
              variant="compact"
              onJsonLoaded={(payload: UploadPayload) => setRightJson(payload)}
            />
          </div>
          <button
            className="compare-button"
            onClick={handleCompare}
            disabled={!leftJson || !rightJson}
          >
            Compare
          </button>
        </div>
      )}
    </div>
  );
};

export default HamburgerMenu;

