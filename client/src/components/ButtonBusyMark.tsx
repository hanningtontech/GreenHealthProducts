/** Product logo spinner shown inside the button the user clicked. */
export default function ButtonBusyMark({ size = 16 }: { size?: number }) {
  return (
    <img
      src="/brand-leaf.png"
      alt=""
      width={size}
      height={size}
      className="button-busy-mark"
      aria-hidden
    />
  );
}
