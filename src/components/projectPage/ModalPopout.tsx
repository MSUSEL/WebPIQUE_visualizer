// visualizer modal popout
import { PropsWithChildren, useEffect, useRef } from "react";

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
      className="modal-overlay"
      ref={overlayRef}
      onClick={onOverlayClick}
      role="dialog"
      aria-modal
    >
      <div className="modal-content" ref={contentRef}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
