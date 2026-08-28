import packageInfo from "../../package.json";
import iconUrl from "../assets/app-icon.png";

export const APP_VERSION = packageInfo.version;
export function BrandIcon({ size = 36 }: { size?: number }) {
  return (
    <img
      className="product-icon"
      src={iconUrl}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}
