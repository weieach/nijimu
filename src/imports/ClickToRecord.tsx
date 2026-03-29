import svgPaths from "./svg-zuepw528g8";
import imgScreenshot20260308At14335Am1 from "figma:asset/40e7ee53ecb1609253bd3d3a5aac31ee194303a3.png";

export default function ClickToRecord() {
  return (
    <div className="bg-[#e0e0e0] relative size-full" data-name="click to record">
      <div className="-translate-x-1/2 absolute bg-[rgba(163,167,175,0.2)] content-stretch flex gap-[19px] items-center justify-center left-[calc(50%-0.13px)] px-[30px] py-[15px] rounded-[100px] top-[916px]">
        <div className="relative shrink-0 size-[18.75px]" data-name="Vector">
          <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 18.75 18.75">
            <path d={svgPaths.p12d5cb00} fill="var(--fill-0, white)" id="Vector" />
          </svg>
        </div>
        <p className="font-['Neue_Haas_Grotesk_Display_Pro:55_Roman',sans-serif] leading-[1.5] lowercase not-italic relative shrink-0 text-[24px] text-shadow-[0px_4px_100px_black] text-white whitespace-nowrap">click to record</p>
      </div>
      <p className="absolute font-['GenRyuMin2_TW:R',sans-serif] leading-[39.2px] left-[649px] lowercase not-italic text-[#7b7b87] text-[28px] top-[212px] tracking-[-2px] whitespace-nowrap">{`What's been lingering on your mind?`}</p>
      <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[534px] left-1/2 pointer-events-none top-[calc(50%+20.5px)] w-[510px]" data-name="Screenshot 2026-03-08 at 1.43.35 AM 1">
        <div className="absolute inset-0 overflow-hidden">
          <img alt="" className="absolute h-[132.65%] left-[-11.7%] max-w-none top-[-16.47%] w-[123.09%]" src={imgScreenshot20260308At14335Am1} />
        </div>
        <div aria-hidden="true" className="absolute border-[#bcbcbc] border-[0.5px] border-solid inset-0" />
      </div>
    </div>
  );
}