import svgPaths from "./svg-ck7nn3w4ht";
import imgScreenshot20260307At1512131 from "figma:asset/f463de63aae6b9a7f2c0f8b593f03e2a04da08b6.png";

export default function RecordingMidProcess() {
  return (
    <div className="bg-[#ededee] relative size-full" data-name="recording mid-process">
      <div className="absolute backdrop-blur-[40px] bg-gradient-to-t from-[rgba(255,255,255,0.4)] h-[222px] left-0 rounded-[8px] to-[rgba(255,255,255,0)] top-[calc(80%-15.2px)] w-[440px]" />
      <div className="absolute h-[61px] left-[11px] rounded-[40px] top-[calc(80%+101.8px)] w-[417px]" />
      <div className="absolute h-[27px] left-[23px] top-[calc(80%+95.8px)] w-[186px]" />
      <p className="-translate-x-1/2 absolute font-['Neue_Montreal:Regular',sans-serif] leading-[1.5] left-[calc(20%+120.6px)] not-italic opacity-50 text-[#515151] text-[14px] text-center top-[calc(80%+127.8px)] tracking-[-0.154px] whitespace-nowrap">creating new memory</p>
      <div className="-translate-x-1/2 absolute h-[75px] left-[calc(50%-0.5px)] top-[calc(80%+38.8px)] w-[99px]" data-name="Background">
        <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 99 75">
          <g data-figma-bg-blur-radius="20" id="Background">
            <rect fill="var(--fill-0, #BCBCBC)" fillOpacity="0.3" height="75" rx="37.5" width="99" />
            <path d={svgPaths.p2687d400} fill="var(--fill-0, white)" id="ô·" />
          </g>
          <defs>
            <clipPath id="bgblur_0_32_320_clip_path" transform="translate(0 0)">
              <rect height="75" rx="37.5" width="99" />
            </clipPath>
          </defs>
        </svg>
      </div>
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[21px] text-[#090606] text-[30px] top-[20px] tracking-[0.6px] whitespace-nowrap">memento</p>
      <div className="absolute h-[470px] left-[58px] top-[176px] w-[261px]" data-name="Screenshot 2026-03-07 at 15.12.13 1">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img alt="" className="absolute h-full left-[-235.71%] max-w-none top-0 w-[631.41%]" src={imgScreenshot20260307At1512131} />
        </div>
      </div>
    </div>
  );
}