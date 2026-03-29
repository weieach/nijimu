import clsx from "clsx";
import PlusSign from "./PlusSign";
import imgScreenshot20260307At1422251 from "figma:asset/44972cbd5c66fe80921c193de551991d00eba0d5.png";
type HomescreenHelperProps = {
  additionalClassNames?: string;
};

function HomescreenHelper({ additionalClassNames = "" }: HomescreenHelperProps) {
  return (
    <div className={clsx("absolute size-[17px]", additionalClassNames)}>
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17 17">
        <circle cx="8.5" cy="8.5" fill="var(--fill-0, #090606)" id="Ellipse 1" r="8.5" />
      </svg>
    </div>
  );
}

export default function Homescreen() {
  return (
    <div className="bg-[#bbb] relative size-full" data-name="homescreen">
      <div className="absolute h-[968px] left-[-103px] top-[-12px] w-[543px]" data-name="Screenshot 2026-03-07 at 14.22.25 1">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgScreenshot20260307At1422251} />
      </div>
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[21px] text-[#e2e2e3] text-[24px] top-[30px] tracking-[0.48px] whitespace-nowrap">memento</p>
      <p className="absolute font-['Georgia:Regular',sans-serif] leading-[1.5] left-[21px] not-italic text-[44px] text-shadow-[0px_4px_100px_black] text-white top-[65px] tracking-[0.88px] whitespace-nowrap">{`Epic one-liner. `}</p>
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[224px] text-[#343633] text-[16px] top-[439px] tracking-[0.32px] whitespace-nowrap">Relocation</p>
      <p className="absolute font-['Georgia:Italic',sans-serif] italic leading-[1.5] left-[132px] text-[#343633] text-[16px] top-[366px] tracking-[0.32px] whitespace-nowrap">2019</p>
      <HomescreenHelper additionalClassNames="left-[142px] top-[337px]" />
      <HomescreenHelper additionalClassNames="left-[252px] top-[411px]" />
      <HomescreenHelper additionalClassNames="left-[413px] top-[366px]" />
      <div className="absolute backdrop-blur-[40px] bg-gradient-to-t from-[rgba(27,27,27,0.4)] h-[222px] left-0 rounded-[8px] to-[rgba(129,129,129,0)] top-[734px] w-[440px]" />
      <div className="absolute content-stretch flex gap-[19px] items-center justify-center left-[37px] px-[40px] py-[20px] rounded-[100px] top-[836px] w-[374px]">
        <div aria-hidden="true" className="absolute border border-solid border-white inset-0 pointer-events-none rounded-[100px]" />
        <div className="relative shrink-0 size-[18.75px]">
          <PlusSign />
        </div>
        <p className="font-['Georgia:Regular',sans-serif] leading-[1.5] not-italic relative shrink-0 text-[24px] text-shadow-[0px_4px_100px_black] text-white tracking-[0.48px] whitespace-nowrap">A New Memory</p>
      </div>
    </div>
  );
}