/**
 * The public logo always goes to the public landing map. The driver-only
 * experience stays in driver mode because DriverRoute guards passenger pages.
 * Admins use the explicit Admin menu link to access their dashboard.
 */
export function logoHomeHref(driver:boolean,admin:boolean):
 '/'|{pathname:'/cloud';params:{mode:'driver'}}{
 return driver&&!admin?{pathname:'/cloud',params:{mode:'driver'}}:'/';
}
