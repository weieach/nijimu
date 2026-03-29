export default function TranscriptFinishedRecording() {
  return (
    <div className="bg-[#ededee] relative size-full" data-name="transcript (finished recording)">
      <div className="absolute content-stretch flex flex-col h-[606px] items-center left-[35px] overflow-x-clip overflow-y-auto top-[96px] w-[345px]">
        <p className="font-['Exposure_Trial:+20',sans-serif] leading-[1.2] not-italic relative shrink-0 text-[#090606] text-[30px] tracking-[0.6px] w-full">Moving into my own place for the first time was honestly a mix of excitement and quiet panic. At first it felt surreal—like, this is actually my space now, no roommates, no parents, just me and a set of keys. The first night was strangely quiet, and I remember sitting on the floor eating takeout because I didn’t even have a table yet. But at the same time, every little thing felt meaningful, like deciding where the couch should go or hanging my first picture on the wall. It made me realize how much responsibility comes with having your own place—paying bills, fixing things when they break—but there’s also this really satisfying sense of independence. It’s the first time I’ve felt like I’m building something that’s completely my own.</p>
      </div>
      <div className="absolute bg-[#ededee] h-[167px] left-0 top-[calc(80%+7.8px)] w-[402px]" />
      <div className="absolute h-[61px] left-[11px] rounded-[40px] top-[calc(80%+101.8px)] w-[417px]" />
      <div className="absolute h-[27px] left-[23px] top-[calc(80%+95.8px)] w-[186px]" />
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[35px] text-[#090606] text-[20px] top-[47px] tracking-[0.4px] whitespace-nowrap">recorded transcript</p>
      <div className="absolute content-stretch flex items-center justify-center left-[21px] px-[40px] py-[20px] rounded-[100px] top-[calc(80%+56.8px)] w-[359px]">
        <div aria-hidden="true" className="absolute border border-[#616161] border-solid inset-0 pointer-events-none rounded-[100px]" />
        <p className="font-['Georgia:Regular',sans-serif] leading-[1.5] not-italic relative shrink-0 text-[#616161] text-[24px] text-shadow-[0px_4px_100px_black] tracking-[0.48px] whitespace-nowrap">Continue</p>
      </div>
    </div>
  );
}