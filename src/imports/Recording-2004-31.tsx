import svgPaths from "./svg-hpzn3032f5";

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
    <div className="bg-[#434343] relative size-full" data-name="recording">
      <p className="absolute font-['GenRyuMin2_TW:R',sans-serif] leading-[39.2px] left-[649px] lowercase not-italic text-[28px] text-white top-[212px] tracking-[-1px] whitespace-nowrap">{`What's been lingering on your mind?`}</p>
      <p className="absolute font-['SF_Mono:Light',sans-serif] leading-[1.2] left-[calc(50%-52px)] not-italic opacity-70 text-[#ebebeb] text-[18px] top-[270px] tracking-[-1px] whitespace-nowrap">recording...</p>
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[828px] lowercase text-[#d7d6d6] text-[20px] top-[71px] whitespace-nowrap">nijimu</p>
      <Continue />
    </div>
  );
}