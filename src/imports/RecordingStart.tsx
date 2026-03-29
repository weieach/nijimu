import imgScreenshot20260307At1512131 from "figma:asset/f463de63aae6b9a7f2c0f8b593f03e2a04da08b6.png";

export default function RecordingStart() {
  return (
    <div className="bg-[#ededee] relative size-full" data-name="recording start">
      <div className="absolute backdrop-blur-[40px] bg-gradient-to-t from-[rgba(27,27,27,0.4)] h-[222px] left-0 rounded-[8px] to-[rgba(129,129,129,0)] top-[734px] w-[440px]" />
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[21px] text-[#090606] text-[30px] top-[20px] tracking-[0.6px] whitespace-nowrap">memento</p>
      <div className="absolute h-[264.651px] left-[-178.19px] top-[327.78px] w-[928.354px]" data-name="Screenshot 2026-03-07 at 15.12.13 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgScreenshot20260307At1512131} />
      </div>
      <div className="absolute font-['Georgia:Regular',sans-serif] leading-[1.5] left-[56px] not-italic text-[#4e4e4e] text-[30px] top-[726px] tracking-[0.6px] whitespace-nowrap whitespace-pre">
        <p className="mb-0">{`Let’s get you started. `}</p>
        <p>{`What’s on your mind? `}</p>
      </div>
      <div className="absolute content-stretch flex items-center justify-center left-[37px] px-[40px] py-[20px] rounded-[100px] top-[836px] w-[374px]">
        <div aria-hidden="true" className="absolute border border-solid border-white inset-0 pointer-events-none rounded-[100px]" />
        <p className="font-['Georgia:Regular',sans-serif] leading-[1.5] not-italic relative shrink-0 text-[24px] text-shadow-[0px_4px_100px_black] text-white tracking-[0.48px] whitespace-nowrap">Start recording</p>
      </div>
    </div>
  );
}