import svgPaths from "./svg-v4a6nixv89";
import imgImage698 from "figma:asset/5b2ad60152ddcf58290b52cffcb2e28c50d70423.png";

function Continue() {
  return (
    <div className="-translate-x-1/2 absolute bg-[rgba(218,218,218,0.25)] content-stretch flex gap-[19px] items-center justify-center left-[calc(50%-0.5px)] px-[30px] py-[15px] rounded-[100px] top-[916px]" data-name="continue">
      <div className="relative shrink-0 size-[20px]" data-name="􀛷">
        <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 20">
          <path d={svgPaths.p220b0800} fill="var(--fill-0, white)" id="ô·" />
        </svg>
      </div>
      <div className="flex flex-col font-['SF_Pro:Light',sans-serif] font-[274.31500244140625] justify-center leading-[0] lowercase relative shrink-0 text-[24px] text-shadow-[0px_4px_100px_black] text-white whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[1.5]">stop</p>
      </div>
    </div>
  );
}

export default function Recording() {
  return (
    <div className="bg-[#e0e0e0] relative size-full" data-name="recording">
      <div className="absolute h-[1821px] left-[-59px] top-[-204px] w-[1845px]" data-name="image 698">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
          <img alt="" className="absolute max-w-none object-cover size-full" src={imgImage698} />
          <div className="absolute bg-gradient-to-b from-[rgba(36,17,13,0.4)] inset-0 to-[rgba(102,102,102,0.4)]" />
        </div>
      </div>
      <p className="absolute font-['GenRyuMin2_TW:R',sans-serif] leading-[39.2px] left-[649px] lowercase not-italic text-[28px] text-white top-[212px] tracking-[-2px] whitespace-nowrap">{`What's been lingering on your mind?`}</p>
      <p className="absolute font-['SF_Mono:Regular',sans-serif] leading-[1.2] left-[calc(50%-52px)] not-italic opacity-70 text-[#ebebeb] text-[18px] top-[270px] tracking-[-1px] whitespace-nowrap">recording...</p>
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[828px] lowercase text-[#d7d6d6] text-[20px] top-[71px] whitespace-nowrap">nijimu</p>
      <Continue />
    </div>
  );
}