import imgScreenshot20260309At24429Pm1 from "figma:asset/1e80ea7d90f9aece26c8eb965943cd3b072923b2.png";

function Frame() {
  return (
    <div className="-translate-x-1/2 absolute bg-[rgba(163,167,175,0.2)] content-stretch flex gap-[19px] items-center justify-center left-[calc(50%+0.5px)] px-[30px] py-[15px] rounded-[100px] text-[#8c8c8c] top-[897px] whitespace-nowrap">
      <p className="font-['Neue_Haas_Grotesk_Display_Pro:55_Roman',sans-serif] leading-[1.5] lowercase not-italic relative shrink-0 text-[24px] text-shadow-[0px_4px_100px_black]">continue</p>
      <div className="flex flex-col font-['SF_Pro:Regular',sans-serif] font-normal justify-center leading-[0] relative shrink-0 text-[20px] text-center" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal]">􀆊</p>
      </div>
    </div>
  );
}

export default function Mediapipe() {
  return (
    <div className="bg-[#e0e0e0] relative size-full" data-name="mediapipe 1">
      <div className="-translate-x-1/2 absolute h-[479px] left-[calc(50%+0.5px)] top-[418px] w-[833px]" data-name="Screenshot 2026-03-09 at 2.44.29 PM 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgScreenshot20260309At24429Pm1} />
      </div>
      <p className="-translate-x-1/2 absolute font-['GenRyuMin2_TW:R',sans-serif] leading-[1.2] left-[calc(50%+0.5px)] lowercase not-italic text-[#7b7b87] text-[28px] text-center top-[248px] tracking-[-1px] whitespace-nowrap">weight</p>
      <div className="-translate-x-1/2 absolute font-['GenRyuMin2_TW:R',sans-serif] leading-[1.2] left-1/2 lowercase not-italic text-[#7b7b87] text-[20px] text-center top-[325px] tracking-[-1px] whitespace-nowrap whitespace-pre">
        <p className="mb-0">{`pinch your fingers together. `}</p>
        <p className="mb-0">{`the tighter you hold, `}</p>
        <p className="mb-0">{`the heavier it becomes. `}</p>
        <p>some things still need to be held.</p>
      </div>
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[828px] lowercase text-[#9b9ba3] text-[20px] top-[71px] whitespace-nowrap">nijimu</p>
      <Frame />
    </div>
  );
}