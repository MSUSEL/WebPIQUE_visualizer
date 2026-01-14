// visualizer modal popout
import { PropsWithChildren, useEffect, useRef } from "react";
import CloseIcon from "@mui/icons-material/Close";

type Props = {
  onClose: () => void;
};

export default function ModalPopout({
  onClose,
  children,
}: PropsWithChildren<Props>) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-[rgba(16,24,40,0.55)]"
      ref={overlayRef}
      onClick={onOverlayClick}
      role="dialog"
      aria-modal
    >
      <div
        className="relative flex h-[80vh] w-[90vw] max-h-[90vh] max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-white p-[12px] pb-[18px] shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
        ref={contentRef}
      >
        <div className="flex items-center justify-end pb-2">
          <button
            className="cursor-pointer bg-transparent text-[20px] leading-none"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon fontSize="inherit" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
