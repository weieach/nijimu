function TextInput() {
  return (
    <div className="absolute h-[49px] left-[716px] top-[490px] w-[298px]" data-name="Text Input">
      <div className="content-stretch flex items-center overflow-clip py-[12px] relative rounded-[inherit] size-full">
        <p className="font-['GenRyuMin2_TW:R',sans-serif] leading-[normal] not-italic relative shrink-0 text-[16px] text-[rgba(42,32,24,0.5)] text-center whitespace-nowrap">something simple is fine...</p>
      </div>
      <div aria-hidden="true" className="absolute border-[rgba(42,32,24,0.3)] border-b border-solid inset-0 pointer-events-none" />
    </div>
  );
}

function TextInput1() {
  return (
    <div className="absolute h-[49px] left-[715px] top-[578px] w-[298px]" data-name="Text Input">
      <div className="content-stretch flex items-center overflow-clip py-[12px] relative rounded-[inherit] size-full">
        <p className="font-['GenRyuMin2_TW:R',sans-serif] leading-[normal] not-italic relative shrink-0 text-[16px] text-[rgba(42,32,24,0.5)] text-center whitespace-nowrap">year of event...</p>
      </div>
      <div aria-hidden="true" className="absolute border-[rgba(42,32,24,0.3)] border-b border-solid inset-0 pointer-events-none" />
    </div>
  );
}

function Frame() {
  return (
    <div className="-translate-x-1/2 absolute bg-[rgba(163,167,175,0.2)] content-stretch flex gap-[19px] items-center justify-center left-[calc(50%-0.13px)] px-[30px] py-[15px] rounded-[100px] text-white top-[916px] whitespace-nowrap">
      <p className="font-['Neue_Haas_Grotesk_Display_Pro:55_Roman',sans-serif] leading-[1.5] lowercase not-italic relative shrink-0 text-[24px] text-shadow-[0px_4px_100px_black]">save to archive</p>
      <div className="flex flex-col font-['SF_Pro:Regular',sans-serif] font-normal justify-center leading-[0] relative shrink-0 text-[20px] text-center" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal]">􀆊</p>
      </div>
    </div>
  );
}

export default function MacBookPro() {
  return (
    <div className="bg-[#e0e0e0] relative size-full" data-name="MacBook Pro 16' - 12">
      <p className="-translate-x-1/2 absolute font-['GenRyuMin2_TW:R',sans-serif] leading-[39.2px] left-[calc(50%+0.5px)] lowercase not-italic text-[#7b7b87] text-[28px] text-center top-[212px] tracking-[-2px] whitespace-nowrap">give this memory a name</p>
      <TextInput />
      <TextInput1 />
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[828px] lowercase text-[#9b9ba3] text-[20px] top-[71px] whitespace-nowrap">nijimu</p>
      <Frame />
    </div>
  );
}