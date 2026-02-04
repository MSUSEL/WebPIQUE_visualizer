import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import Hamburger from "hamburger-react";
import { useLocation, useNavigate } from "react-router-dom";
import FileUpload from "../headerfooter/FileUpload";

type UploadPayload = { filename: string; data: any };

const MENU_TOP = 40;
const MENU_WIDTH = 270;
const IDB_NAME = "wp_payload_db";
const IDB_STORE = "payloads";
const IDB_SINGLE_KEY = "single";
const IDB_COMPARE_KEY = "compare";
const IDB_SINGLE_PENDING_KEY = "wp_single_pending_idb";
const IDB_COMPARE_PENDING_KEY = "wp_compare_pending_idb";

// keys for passing data between pages
const SINGLE_PAYLOAD_KEY = "wp_single_payload";
const COMPARE_PAYLOAD_KEY = "wp_compare_payload";
const COMPARE_PAYLOAD_SESSION_KEY = "wp_compare_payload_session";

const HamburgerMenu: React.FC = () => {
  const [isOpen, setOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showCompareSubmenu, setShowCompareSubmenu] = useState(false);
  const [leftJson, setLeftJson] = useState<UploadPayload | null>(null);
  const [rightJson, setRightJson] = useState<UploadPayload | null>(null);

  const [submenuTop, setSubmenuTop] = useState<number>(MENU_TOP);
  const navigate = useNavigate(); // still available if you need it elsewhere
  const location = useLocation();

  // anchor: measure the top of the "Compare" and "Login" rows inside the menu
  const menuRef = useRef<HTMLDivElement>(null);
  const compareRowRef = useRef<HTMLDivElement>(null);
  const loginRowRef = useRef<HTMLDivElement>(null);

  // authorization component handler (currently unused UI)
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // --- helper: close menu + in-app navigation ---
  const hardNavigate = (path: string) => {
    setOpen(false);
    setShowCompareSubmenu(false);
    setShowLogin(false);
    setLeftJson(null);
    setRightJson(null);

    navigate(path, { replace: true });
  };

  const softNavigate = (path: string, state?: Record<string, unknown>) => {
    setOpen(false);
    setShowCompareSubmenu(false);
    setShowLogin(false);
    setLeftJson(null);
    setRightJson(null);

    navigate(path, { state });
  };

  // --- helper: store payload + navigate (for visualizer / compare) ---
  const openPayloadDb = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  const storeSinglePayload = (payload: UploadPayload) =>
    openPayloadDb().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore(IDB_STORE).put(payload, IDB_SINGLE_KEY);
        })
    );

  const storeComparePayload = (payload: {
    file1: UploadPayload;
    file2: UploadPayload;
  }) =>
    openPayloadDb().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore(IDB_STORE).put(payload, IDB_COMPARE_KEY);
        })
    );

  const goToSingleVisualizer = async (payload: UploadPayload) => {
    let storedLocal = false;
    let storedIdb = false;
    try {
      localStorage.setItem(SINGLE_PAYLOAD_KEY, JSON.stringify(payload));
      storedLocal = true;
      sessionStorage.removeItem(IDB_SINGLE_PENDING_KEY);
    } catch {
      storedLocal = false;
      try {
        localStorage.removeItem(SINGLE_PAYLOAD_KEY);
      } catch {
        /* ignore */
      }
      try {
        sessionStorage.setItem(IDB_SINGLE_PENDING_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    try {
      await storeSinglePayload(payload);
      storedIdb = true;
    } catch {
      storedIdb = false;
    }
    if (location.pathname === "/visualizer") {
      softNavigate("/visualizer", { jsonData: payload.data });
    } else {
      if (storedLocal || storedIdb) {
        hardNavigate("/visualizer");
      } else {
        softNavigate("/visualizer", { jsonData: payload.data });
      }
    }
  };

  const goToCompareVisualizer = async (payload: {
    file1: UploadPayload;
    file2: UploadPayload;
  }) => {
    (globalThis as any).__wpComparePayload = payload;
    let storedSession = false;
    let storedLocal = false;
    try {
      sessionStorage.setItem(
        COMPARE_PAYLOAD_SESSION_KEY,
        JSON.stringify(payload)
      );
      storedSession = true;
    } catch {
      storedSession = false;
      try {
        sessionStorage.removeItem(COMPARE_PAYLOAD_SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
    try {
      localStorage.setItem(COMPARE_PAYLOAD_KEY, JSON.stringify(payload));
      storedLocal = true;
    } catch {
      storedLocal = false;
      try {
        localStorage.removeItem(COMPARE_PAYLOAD_KEY);
      } catch {
        /* ignore */
      }
    }
    try {
      await storeComparePayload(payload);
    } catch {
      /* ignore */
    }
    try {
      if (storedSession || storedLocal) {
        sessionStorage.removeItem(IDB_COMPARE_PENDING_KEY);
      } else {
        sessionStorage.setItem(IDB_COMPARE_PENDING_KEY, "1");
      }
    } catch {
      /* ignore */
    }
    if (location.pathname !== "/compare" && (storedSession || storedLocal)) {
      hardNavigate("/compare");
      return;
    }
    softNavigate("/compare", {
      file1: payload.file1,
      file2: payload.file2,
      ts: Date.now(),
    });
  };

  const handleCompare = () => {
    if (!leftJson || !rightJson) return;
    setOpen(false);
    setShowCompareSubmenu(false);
    setShowLogin(false);
    void goToCompareVisualizer({ file1: leftJson, file2: rightJson });
  };

  // reset all submenu state on close
  const handleToggle = (next: React.SetStateAction<boolean>) => {
    setOpen((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      if (!resolved) {
        setShowCompareSubmenu(false);
        setShowLogin(false);
        setLeftJson(null);
        setRightJson(null);
      }
      return resolved;
    });
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

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      handleToggle(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  const canSubmit =
    !authLoading && username.trim().length > 0 && password.trim().length >= 6;

  return (
    <div className="relative z-[3000]" ref={menuRef}>
      <div className="z-[1001] ml-[10px] flex h-full items-center justify-start">
        <Hamburger toggled={isOpen} toggle={handleToggle} size={22} />
      </div>

      {isOpen && (
        <div className="absolute left-0 top-[40px] z-[3100] w-[270px] rounded-[7px] border-2 border-[lightgrey] bg-white p-[15px] text-black shadow">
          <h2 className="mb-2 text-[18px] font-bold text-black">
            WebPIQUE Visualizer Menu
          </h2>
          <hr className="my-2 border-0 border-t-2 border-[#ccc]" />

          {/* Home – full navigation */}
          <div
            className="flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-[16px] text-[#333] hover:bg-[#f2f2f2]"
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
                void goToSingleVisualizer({ filename, data });
              }}
            />
          </div>

          {/* Compare submenu toggle */}
          <div
            ref={compareRowRef}
            className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-[16px] text-[#333] hover:bg-[#f2f2f2] ${showCompareSubmenu ? "bg-[#e8f0fe] font-semibold" : ""
              }`}
            onClick={() => {
              setShowCompareSubmenu((v) => !v);
              setShowLogin(false);
            }}
          >
            <span>Compare</span>
            <span className="ml-2 inline-block text-[14px] leading-none" aria-hidden>
              &gt;
            </span>
          </div>

          {/* Project – full navigation */}
          <div
            className="flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-[16px] text-[#333] hover:bg-[#f2f2f2]"
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
          className="absolute z-[3200] -ml-[2px] flex w-[280px] flex-col gap-2 rounded-[7px] border-2 border-[lightgrey] bg-white p-[15px] text-black shadow"
          style={{
            top: submenuTop,
            left: MENU_WIDTH,
          }}
        >
          <h3 className="-mb-[3px] text-[18px] font-bold text-black">
            Select Files to Compare
          </h3>
          <hr className="my-2 border-0 border-t-2 border-[#ccc]" />
          <div className="mb-3 flex flex-col text-[15px]">
            <label className="mb-2 font-medium">Left Side:</label>
            <FileUpload
              variant="compact"
              onJsonLoaded={(payload: UploadPayload) => setLeftJson(payload)}
            />
          </div>
          <div className="mb-3 flex flex-col text-[15px]">
            <label className="mb-2 font-medium">Right Side:</label>
            <FileUpload
              variant="compact"
              onJsonLoaded={(payload: UploadPayload) => setRightJson(payload)}
            />
          </div>
          <button
            className={`mt-1 w-3/5 self-center rounded-lg border px-3.5 py-2 text-[15px] text-white shadow-sm disabled:cursor-not-allowed disabled:border-[#0d6efd] disabled:bg-[#9bbcf9] disabled:text-[white] ${leftJson && rightJson ? "bg-[#0d6efd]" : ""
              }`}
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
