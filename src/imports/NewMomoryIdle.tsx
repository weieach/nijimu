import PlusSign from "./PlusSign";

export default function NewMomoryIdle() {
  return (
    <div className="bg-[rgba(218,218,218,0.25)] backdrop-blur-[40px] content-stretch flex gap-[12px] items-center justify-center px-[24px] py-[12px] relative rounded-[100px] size-full" data-name="new momory/idle">
      <p className="font-['Neue_Haas_Grotesk_Display_Pro:45_Light',sans-serif] leading-[1.5] lowercase not-italic relative shrink-0 text-[16px] text-shadow-[0px_4px_100px_black] text-white whitespace-nowrap">New Memory</p>
      <div className="relative shrink-0 size-[14px]">
        <PlusSign />
      </div>
    </div>
  );
}