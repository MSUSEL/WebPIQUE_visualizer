//component for hamburger menu and it's functionality
import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import Hamburger from "hamburger-react";
import { useNavigate } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import { login, signup } from "../Utilities/Authorization";
import "../styles/HamburgerMenuStyle.css";

type UploadPayload = { filename: string; data: any };

const MENU_TOP = 40; // variable for better position control
const MENU_WIDTH = 270; // variable for better position control

const HamburgerMenu: React.FC = () => {
  const [isOpen, setOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showCompareSubmenu, setShowCompareSubmenu] = useState(false);
  const [leftJson, setLeftJson] = useState<UploadPayload | null>(null);
  const [rightJson, setRightJson] = useState<UploadPayload | null>(null);

  const [submenuTop, setSubmenuTop] = useState<number>(MENU_TOP);
  const navigate = useNavigate();

  // anchor: measure the top of the "Compare" and "Login" rows inside the menu
  const compareRowRef = useRef<HTMLDivElement>(null);
  const loginRowRef = useRef<HTMLDivElement>(null);

  // authorization component handler
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleCompare = () => {
    if (!leftJson || !rightJson) return;
    // close menus before navigating
    setOpen(false);
    setShowCompareSubmenu(false);
    setShowLogin(false);
    navigate("/compare", { state: { file1: leftJson, file2: rightJson } });
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
      setAuthError(null);
      setAuthMode("login");
      setAuthLoading(false);
    }
  }, [isOpen, showLogin]);

  const canSubmit =
    !authLoading && username.trim().length > 0 && password.trim().length >= 6; // simple length check

  /*  
  async function handleAuthSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setAuthError(null);
    if (!canSubmit) return;

    try {
      setAuthLoading(true);
      const data =
        authMode === "login"
          ? await login(username.trim(), password)
          : await signup(username.trim(), password);

      setOpen(false);
      setShowLogin(false);

      // navigate to the project page
      navigate("/projects");
    } catch (err: any) {
      setAuthError(err?.message ?? "Something went wrong.");
    } finally {
      setAuthLoading(false);
    }
  }
    */

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
              setOpen(false); // close the hamburger
              setShowCompareSubmenu(false);
              navigate("/"); // go to LandingPage ("/")
            }}
          >
            <span>Home</span>
          </div>

          {/* single-file upload */}
          <div
            onClick={() => {
              setShowCompareSubmenu(false);
            }}
          >
            <FileUpload
              variant="menuItem"
              onJsonLoaded={({ filename, data }: UploadPayload) => {
                handleToggle(false);
                navigate("/visualizer", {
                  state: { jsonData: data, filename },
                }); // go to SingleFilePage
              }}
            />
          </div>

          {/* compare submenu toggle, go to ComparePage */}
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

          <div
            className="menu-item"
            onClick={() => {
              setOpen(false); // close the hamburger
              setShowCompareSubmenu(false);
              navigate("/projects"); // go to Project page
            }}
          >
            <span>Project</span>
          </div>

          {/* Login 
          <div
            ref={loginRowRef}
            className={`menu-item ${showLogin ? "active" : ""}`}
            onClick={() => {
              setShowLogin((v) => !v);
              setShowCompareSubmenu(false);
            }}
          >
            <span>Login</span>
            <span className="chevron" aria-hidden>
              &gt;
            </span>
          </div>
          */}
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

      {/* login submenu 
      {isOpen && showLogin && (
        <div
          className="submenu locked"
          style={{ top: submenuTop, left: MENU_WIDTH }}
        >
          <h3 className="submenu-title">{authMode === "login" ? "Login" : "Create Account"}</h3>
          <hr />

          <form onSubmit={handleAuthSubmit}>
            <div className="login-fields">
              <label htmlFor="username">Username:</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="you@example.com"
              />
            </div>

            <div className="login-fields">
              <label htmlFor="password">Password:</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                placeholder="••••••••"
              />
            </div>

            {authError && <div className="error-text">{authError}</div>}

            <button
              className="compare-button"
              type="submit"
              disabled={!canSubmit}
            >
              {authMode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div >
            {authMode === "login" ? (
              <>
                <button
                  type="button"
                  className="linklike"
                  disabled={authLoading}
                  onClick={() => setAuthMode("signup")}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="linklike"
                  onClick={() => setAuthMode("login")}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      )}
      */}
    </div>
  );
};

export default HamburgerMenu;
