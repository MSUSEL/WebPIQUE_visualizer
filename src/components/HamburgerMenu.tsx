//component for hamburger menu and it's functionality
import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import Hamburger from "hamburger-react";
import { useNavigate } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import "../styles/HamburgerMenuStyle.css";

type UploadPayload = { filename: string; data: any };

const MENU_TOP = 40;     // variable for better position control
const MENU_WIDTH = 270;  // variable for better position control

const HamburgerMenu: React.FC = () => {
  const [isOpen, setOpen] = useState(false);
  const [showCompareSubmenu, setShowCompareSubmenu] = useState(false);
  const [leftJson, setLeftJson] = useState<UploadPayload | null>(null);
  const [rightJson, setRightJson] = useState<UploadPayload | null>(null);
  const bothLoaded = !!leftJson && !!rightJson;

  const [submenuTop, setSubmenuTop] = useState<number>(MENU_TOP);
  const navigate = useNavigate();

  // anchor: measure the top of the "Compare" row inside the menu
  const compareRowRef = useRef<HTMLDivElement>(null);

  const handleCompare = () => {
    if (!leftJson || !rightJson) return;
    // close menus before navigating
    setOpen(false);
    setShowCompareSubmenu(false);
    navigate("/compare", { state: { file1: leftJson, file2: rightJson } });
  };

  // reset all submenu state on close
  const handleToggle = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setShowCompareSubmenu(false);
      setLeftJson(null);
      setRightJson(null);
    }
  };

  // determine submenu top whenever menu opens or layout might change
  useLayoutEffect(() => {
    if (isOpen && compareRowRef.current) {
      // offsetTop is within .menu; add MENU_TOP to align in the page
      setSubmenuTop(MENU_TOP + compareRowRef.current.offsetTop);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      // reset submenu + file state when menu closes
      setShowCompareSubmenu(false);
      setLeftJson(null);
      setRightJson(null);
    }
  }, [isOpen]);

  return (
    <div className="menu-container">
      <div className="hamburger-container">
        <Hamburger toggled={isOpen} toggle={setOpen} size={22} />
      </div>

      {isOpen && (
        <div className="menu">
          <h2 className="menu-title">WebPIQUE Visualizer Menu</h2>
          <hr />

          <div
            className="menu-item"
            onClick={() => {
              setOpen(false);          // close the hamburger
              setShowCompareSubmenu(false);
              navigate("/");           // go to LandingPage ("/")
            }}
          >
            <span>Home</span>
          </div>

          {/* single-file upload */}
          <FileUpload
            variant="menuItem"
            onJsonLoaded={({ filename, data }: UploadPayload) => {
              handleToggle(false);
              navigate("/visualizer", { state: { jsonData: data, filename } });
            }}
          />

          {/* compare submenu toggle */}
          <div
            ref={compareRowRef}
            className={`menu-item ${showCompareSubmenu ? "active" : ""}`}
            onClick={() => setShowCompareSubmenu(v => !v)}
          >
            <span>Compare</span>
            <span className="chevron" aria-hidden>&gt;</span>
          </div>
        </div>
      )}

      {/* compare submenu: locked next to the menu, aligned with "Compare" */}
      {isOpen && showCompareSubmenu && (
        <div
          className="submenu locked"
          style={{
            top: submenuTop,
            left: MENU_WIDTH,
          }}
        >
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
          {bothLoaded && (
            <button className="compare-button raised" onClick={handleCompare}>
              Compare
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default HamburgerMenu;


