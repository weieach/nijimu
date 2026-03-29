import imgScreenshot20260308At1711337 from "figma:asset/3e3d81698ec136de7365210c7ef57940d2adc99f.png";
import imgScreenshot20260308At51242Pm4 from "figma:asset/8975338d08187b11fc736dc92bc2db46688ad825.png";

export default function Frame() {
  return (
    <div className="bg-[#e1e1e2] relative size-full">
      <div className="absolute h-[225px] left-[351px] top-[380px] w-[873px]" data-name="Screenshot 2026-03-08 at 17.11.33 4" />
      <div className="absolute h-[931px] left-[32px] top-[78px] w-[1315px]" data-name="Screenshot 2026-03-08 at 17.11.33 7">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgScreenshot20260308At1711337} />
      </div>
      <div className="absolute h-[593px] left-[389px] top-[187px] w-[601px]" data-name="Screenshot 2026-03-08 at 5.12.42 PM 4">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgScreenshot20260308At51242Pm4} />
      </div>
      <div className="absolute bg-[#dededf] h-[56px] left-[1297px] top-[972px] w-[44px]" />
    </div>
  );
}