import { useState } from "react";
import { useNavigate } from "react-router";
import { COLOR_PALETTE } from "../lib/colors";
import { GalleryViewToggle } from "./GalleryViewToggle";
import { CAROUSEL_PATH } from "../lib/routes";
import {
  AddMemoryCard,
  ArtifactCard,
  GalleryPage,
  generateGalleryMemories,
} from "./memoryGallery";

export function MemoryScrollPage() {
  const navigate = useNavigate();
  const [memories] = useState(generateGalleryMemories);

  const handleMemoryClick = (memory: (typeof memories)[number]) => {
    navigate("/memory/revisit", {
      state: {
        memory: {
          id: memory.id,
          event: memory.title,
          year: memory.year,
          color: memory.color,
        },
        shape: {
          modelPath: memory.shape.modelPath,
          fluidity: memory.shape.fluidity,
          evolve: memory.shape.evolve,
          bumpAmount: memory.shape.bumpAmount,
          colors: {
            color1: COLOR_PALETTE[memory.shape.colorIndex].light1,
            color2: COLOR_PALETTE[memory.shape.colorIndex].light2,
            matColor: COLOR_PALETTE[memory.shape.colorIndex].color,
          },
        },
      },
    });
  };

  return (
    <>
      <GalleryPage>
        <AddMemoryCard onClick={() => navigate("/record/start")} />
        {memories.map((memory) => (
          <ArtifactCard
            key={memory.id}
            memory={memory}
            onOpen={() => handleMemoryClick(memory)}
          />
        ))}
      </GalleryPage>
      <GalleryViewToggle
        view="grid"
        onToggle={() => navigate(CAROUSEL_PATH)}
      />
    </>
  );
}
