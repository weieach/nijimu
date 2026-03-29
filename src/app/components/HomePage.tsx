import { useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import { useEffect } from "react";

export function HomePage() {
  const navigate = useNavigate();

  // Expose navigate to window for BlobScene profile button
  useEffect(() => {
    (window as any).__nijimu_navigate__ = navigate;
    return () => {
      delete (window as any).__nijimu_navigate__;
    };
  }, [navigate]);

  return (
    <BlobScene onNewMemory={() => navigate("/record/start")} />
  );
}