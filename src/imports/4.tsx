function Frame() {
  return (
    <div className="-translate-x-1/2 absolute bg-[rgba(163,167,175,0.2)] content-stretch flex gap-[19px] items-center justify-center left-[calc(50%-0.13px)] px-[30px] py-[15px] rounded-[100px] text-white top-[916px] whitespace-nowrap">
      <p className="font-['Neue_Haas_Grotesk_Display_Pro:55_Roman',sans-serif] leading-[1.5] lowercase not-italic relative shrink-0 text-[24px] text-shadow-[0px_4px_100px_black]">continue</p>
      <div className="flex flex-col font-['SF_Pro:Regular',sans-serif] font-normal justify-center leading-[0] relative shrink-0 text-[20px] text-center" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal]">􀆊</p>
      </div>
    </div>
  );
}

export default function Component() {
  return (
    <div className="bg-[#e0e0e0] relative size-full" data-name="4">
      <div className="-translate-x-1/2 absolute font-['GenRyuMin2_TW:R',sans-serif] leading-[39.2px] left-1/2 lowercase not-italic text-[#7b7b87] text-[28px] text-center top-[212px] tracking-[-2px] whitespace-nowrap">
        <p className="mb-0">drag to highlight the words</p>
        <p>that touch you the most.</p>
      </div>
      <p className="-translate-x-1/2 absolute font-['Exposure_Trial:+20',sans-serif] leading-[1.5] left-[calc(50%-0.5px)] not-italic text-[#2D2727] text-[22px] text-center top-[100px] tracking-[0.44px] w-[847px]">Moving into my own place for the first time was honestly a mix of excitement and quiet panic. At first it felt surreal—like, this is actually my space now, no roommates, no parents, just me and a set of keys. The first night was strangely quiet, and I remember sitting on the floor eating takeout because I didn't even have a table yet. But at the same time, every little thing felt meaningful, like deciding where the couch should go or hanging my first picture on the wall. It made me realize how much responsibility comes with having your own place—paying bills, fixing things when they break—but there's also this really satisfying sense of independence. It's the first time I've felt like I'm building something that's completely my own.</p>
      <Frame />
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[828px] lowercase text-[#9b9ba3] text-[20px] top-[71px] whitespace-nowrap">nijimu</p>
    </div>
  );
}