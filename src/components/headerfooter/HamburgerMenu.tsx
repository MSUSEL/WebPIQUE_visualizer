import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import Hamburger from "hamburger-react";
import { useNavigate } from "react-router-dom";
import FileUpload from "../headerfooter/FileUpload";
import "../../styles/HamburgerMenuStyle.css";

type UploadPayload = { filename: string; data: any };

const MENU_TOP = 40;
const MENU_WIDTH = 270;

// keys for passing data between pages
const SINGLE_PAYLOAD_KEY = "wp_single_payload";
const COMPARE_PAYLOAD_KEY = "wp_compare_payload";

const HamburgerMenu: React.FC = () => {
  const [isOpen, setOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showCompareSubmenu, setShowCompareSubmenu] = useState(false);
  const [leftJson, setLeftJson] = useState<UploadPayload | null>(null);
  const [rightJson, setRightJson] = useState<UploadPayload | null>(null);

  const [submenuTop, setSubmenuTop] = useState<number>(MENU_TOP);
  const navigate = useNavigate(); // still available if you need it elsewhere

  // anchor: measure the top of the "Compare" and "Login" rows inside the menu
  const compareRowRef = useRef<HTMLDivElement>(null);
  const loginRowRef = useRef<HTMLDivElement>(null);

  // authorization component handler (currently unused UI)
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // --- helper: close menu + hard navigation ---
  const hardNavigate = (path: string) => {
    setOpen(false);
    setShowCompareSubmenu(false);
    setShowLogin(false);
    setLeftJson(null);
    setRightJson(null);

    window.location.assign(path);
  };

  // --- helper: store payload + navigate (for visualizer / compare) ---
  const goToSingleVisualizer = (payload: UploadPayload) => {
    try {
      localStorage.setItem(SINGLE_PAYLOAD_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
    hardNavigate("/visualizer");
  };

  const goToCompareVisualizer = (payload: {
    file1: UploadPayload;
    file2: UploadPayload;
  }) => {
    try {
      localStorage.setItem(COMPARE_PAYLOAD_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
    hardNavigate("/compare");
  };

  const handleCompare = () => {
    if (!leftJson || !rightJson) return;
    setOpen(false);
    setShowCompareSubmenu(false);
    setShowLogin(false);
    goToCompareVisualizer({ file1: leftJson, file2: rightJson });
  };

  // reset all submenu state on close
  const handleToggle = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setShowCompareSubmenu(false);
      setShowLogin(false);
      setLeftJson(null);
      setRightJson(null);
    }
  };

  // keep submenu aligned with the active row
  useLayoutEffect(() => {
    if (!isOpen) return;
    const target = showCompareSubmenu
      ? compareRowRef.current
      : showLogin
      ? loginRowRef.current
      : null;
    if (target) setSubmenuTop(MENU_TOP + target.offsetTop);
  }, [isOpen, showCompareSubmenu, showLogin]);

  useEffect(() => {
    if (!isOpen || !showLogin) {
      setUsername("");
      setPassword("");
      setAuthLoading(false);
    }
  }, [isOpen, showLogin]);

  const canSubmit =
    !authLoading && username.trim().length > 0 && password.trim().length >= 6;

  return (
    <div className="menu-container">
      <div className="hamburger-container">
        <Hamburger toggled={isOpen} toggle={setOpen} size={22} />
      </div>

      {isOpen && (
        <div className="menu">
          <h2 className="menu-title">WebPIQUE Visualizer Menu</h2>
          <hr />

          {/* Home – full navigation */}
          <div
            className="menu-item"
            onClick={() => {
              hardNavigate("/");
            }}
          >
            <span>Home</span>
          </div>

          {/* Single-file upload: store payload + full navigation */}
          <div
            onClick={() => {
              setShowCompareSubmenu(false);
            }}
          >
            <FileUpload
              variant="menuItem"
              onJsonLoaded={({ filename, data }: UploadPayload) => {
                handleToggle(false);
                goToSingleVisualizer({ filename, data });
              }}
            />
          </div>

          {/* Compare submenu toggle */}
          <div
            ref={compareRowRef}
            className={`menu-item ${showCompareSubmenu ? "active" : ""}`}
            onClick={() => {
              setShowCompareSubmenu((v) => !v);
              setShowLogin(false);
            }}
          >
            <span>Compare</span>
            <span className="chevron" aria-hidden>
              &gt;
            </span>
          </div>

          {/* Project – full navigation */}
          <div
            className="menu-item"
            onClick={() => {
              hardNavigate("/projects");
            }}
          >
            <span>Project</span>
          </div>
        </div>
      )}

      {/* compare submenu */}
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
