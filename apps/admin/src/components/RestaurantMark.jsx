/**
 * A restaurant's logo, or its emoji when there isn't one.
 *
 * Every place the portal identifies a restaurant used to print `logoEmoji`
 * directly, so an owner who uploaded a logo saw it on their storefront and
 * nowhere in the portal they actually work in. One component, so the next
 * place that names a restaurant cannot forget again.
 */
export default function RestaurantMark({ restaurant, className = '', size }) {
  const url = restaurant?.logoImage?.url || restaurant?.logoUrl;
  const style = size ? { width: size, height: size, fontSize: `calc(${size}px * 0.55)` } : undefined;

  return (
    <span className={`restaurant-mark ${className}`} style={style} aria-hidden>
      {url
        ? <img src={url} alt="" />
        : (restaurant?.logoEmoji || '🍽️')}
    </span>
  );
}
