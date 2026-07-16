import { useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";

export function HomePage() {
  const navigate = useNavigate();
  return <BlobScene onNewMemory={() => navigate("/record/start")} />;
}