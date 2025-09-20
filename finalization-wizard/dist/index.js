import * as p from "react";
import Y, { createContext as us, useRef as at, useLayoutEffect as Cu, useEffect as li, useId as ci, useContext as We, useInsertionEffect as Yo, useMemo as ke, useCallback as qo, Children as Su, isValidElement as ku, useState as ve, Fragment as Xo, createElement as Rn, forwardRef as di, Component as Tu } from "react";
import * as Pu from "react-dom";
import Eu from "react-dom";
var nn = { exports: {} }, js = {};
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var na;
function Au() {
  if (na) return js;
  na = 1;
  var e = Y, t = Symbol.for("react.element"), n = Symbol.for("react.fragment"), r = Object.prototype.hasOwnProperty, i = e.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, a = { key: !0, ref: !0, __self: !0, __source: !0 };
  function o(l, c, u) {
    var d, m = {}, h = null, f = null;
    u !== void 0 && (h = "" + u), c.key !== void 0 && (h = "" + c.key), c.ref !== void 0 && (f = c.ref);
    for (d in c) r.call(c, d) && !a.hasOwnProperty(d) && (m[d] = c[d]);
    if (l && l.defaultProps) for (d in c = l.defaultProps, c) m[d] === void 0 && (m[d] = c[d]);
    return { $$typeof: t, type: l, key: h, ref: f, props: m, _owner: i.current };
  }
  return js.Fragment = n, js.jsx = o, js.jsxs = o, js;
}
var ws = {};
/**
 * @license React
 * react-jsx-runtime.development.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var ra;
function Ru() {
  return ra || (ra = 1, process.env.NODE_ENV !== "production" && (function() {
    var e = Y, t = Symbol.for("react.element"), n = Symbol.for("react.portal"), r = Symbol.for("react.fragment"), i = Symbol.for("react.strict_mode"), a = Symbol.for("react.profiler"), o = Symbol.for("react.provider"), l = Symbol.for("react.context"), c = Symbol.for("react.forward_ref"), u = Symbol.for("react.suspense"), d = Symbol.for("react.suspense_list"), m = Symbol.for("react.memo"), h = Symbol.for("react.lazy"), f = Symbol.for("react.offscreen"), v = Symbol.iterator, g = "@@iterator";
    function N(x) {
      if (x === null || typeof x != "object")
        return null;
      var M = v && x[v] || x[g];
      return typeof M == "function" ? M : null;
    }
    var j = e.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    function b(x) {
      {
        for (var M = arguments.length, V = new Array(M > 1 ? M - 1 : 0), H = 1; H < M; H++)
          V[H - 1] = arguments[H];
        y("error", x, V);
      }
    }
    function y(x, M, V) {
      {
        var H = j.ReactDebugCurrentFrame, ce = H.getStackAddendum();
        ce !== "" && (M += "%s", V = V.concat([ce]));
        var fe = V.map(function(ie) {
          return String(ie);
        });
        fe.unshift("Warning: " + M), Function.prototype.apply.call(console[x], console, fe);
      }
    }
    var S = !1, T = !1, E = !1, A = !1, k = !1, L;
    L = Symbol.for("react.module.reference");
    function O(x) {
      return !!(typeof x == "string" || typeof x == "function" || x === r || x === a || k || x === i || x === u || x === d || A || x === f || S || T || E || typeof x == "object" && x !== null && (x.$$typeof === h || x.$$typeof === m || x.$$typeof === o || x.$$typeof === l || x.$$typeof === c || // This needs to include all possible module reference object
      // types supported by any Flight configuration anywhere since
      // we don't know which Flight build this will end up being used
      // with.
      x.$$typeof === L || x.getModuleId !== void 0));
    }
    function q(x, M, V) {
      var H = x.displayName;
      if (H)
        return H;
      var ce = M.displayName || M.name || "";
      return ce !== "" ? V + "(" + ce + ")" : V;
    }
    function P(x) {
      return x.displayName || "Context";
    }
    function be(x) {
      if (x == null)
        return null;
      if (typeof x.tag == "number" && b("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), typeof x == "function")
        return x.displayName || x.name || null;
      if (typeof x == "string")
        return x;
      switch (x) {
        case r:
          return "Fragment";
        case n:
          return "Portal";
        case a:
          return "Profiler";
        case i:
          return "StrictMode";
        case u:
          return "Suspense";
        case d:
          return "SuspenseList";
      }
      if (typeof x == "object")
        switch (x.$$typeof) {
          case l:
            var M = x;
            return P(M) + ".Consumer";
          case o:
            var V = x;
            return P(V._context) + ".Provider";
          case c:
            return q(x, x.render, "ForwardRef");
          case m:
            var H = x.displayName || null;
            return H !== null ? H : be(x.type) || "Memo";
          case h: {
            var ce = x, fe = ce._payload, ie = ce._init;
            try {
              return be(ie(fe));
            } catch {
              return null;
            }
          }
        }
      return null;
    }
    var me = Object.assign, pe = 0, de, re, w, B, W, G, xe;
    function oe() {
    }
    oe.__reactDisabledLog = !0;
    function ee() {
      {
        if (pe === 0) {
          de = console.log, re = console.info, w = console.warn, B = console.error, W = console.group, G = console.groupCollapsed, xe = console.groupEnd;
          var x = {
            configurable: !0,
            enumerable: !0,
            value: oe,
            writable: !0
          };
          Object.defineProperties(console, {
            info: x,
            log: x,
            warn: x,
            error: x,
            group: x,
            groupCollapsed: x,
            groupEnd: x
          });
        }
        pe++;
      }
    }
    function Z() {
      {
        if (pe--, pe === 0) {
          var x = {
            configurable: !0,
            enumerable: !0,
            writable: !0
          };
          Object.defineProperties(console, {
            log: me({}, x, {
              value: de
            }),
            info: me({}, x, {
              value: re
            }),
            warn: me({}, x, {
              value: w
            }),
            error: me({}, x, {
              value: B
            }),
            group: me({}, x, {
              value: W
            }),
            groupCollapsed: me({}, x, {
              value: G
            }),
            groupEnd: me({}, x, {
              value: xe
            })
          });
        }
        pe < 0 && b("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
      }
    }
    var we = j.ReactCurrentDispatcher, le;
    function Le(x, M, V) {
      {
        if (le === void 0)
          try {
            throw Error();
          } catch (ce) {
            var H = ce.stack.trim().match(/\n( *(at )?)/);
            le = H && H[1] || "";
          }
        return `
` + le + x;
      }
    }
    var He = !1, Ge;
    {
      var Qe = typeof WeakMap == "function" ? WeakMap : Map;
      Ge = new Qe();
    }
    function tt(x, M) {
      if (!x || He)
        return "";
      {
        var V = Ge.get(x);
        if (V !== void 0)
          return V;
      }
      var H;
      He = !0;
      var ce = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      var fe;
      fe = we.current, we.current = null, ee();
      try {
        if (M) {
          var ie = function() {
            throw Error();
          };
          if (Object.defineProperty(ie.prototype, "props", {
            set: function() {
              throw Error();
            }
          }), typeof Reflect == "object" && Reflect.construct) {
            try {
              Reflect.construct(ie, []);
            } catch (Je) {
              H = Je;
            }
            Reflect.construct(x, [], ie);
          } else {
            try {
              ie.call();
            } catch (Je) {
              H = Je;
            }
            x.call(ie.prototype);
          }
        } else {
          try {
            throw Error();
          } catch (Je) {
            H = Je;
          }
          x();
        }
      } catch (Je) {
        if (Je && H && typeof Je.stack == "string") {
          for (var ne = Je.stack.split(`
`), Xe = H.stack.split(`
`), Pe = ne.length - 1, Re = Xe.length - 1; Pe >= 1 && Re >= 0 && ne[Pe] !== Xe[Re]; )
            Re--;
          for (; Pe >= 1 && Re >= 0; Pe--, Re--)
            if (ne[Pe] !== Xe[Re]) {
              if (Pe !== 1 || Re !== 1)
                do
                  if (Pe--, Re--, Re < 0 || ne[Pe] !== Xe[Re]) {
                    var nt = `
` + ne[Pe].replace(" at new ", " at ");
                    return x.displayName && nt.includes("<anonymous>") && (nt = nt.replace("<anonymous>", x.displayName)), typeof x == "function" && Ge.set(x, nt), nt;
                  }
                while (Pe >= 1 && Re >= 0);
              break;
            }
        }
      } finally {
        He = !1, we.current = fe, Z(), Error.prepareStackTrace = ce;
      }
      var Kt = x ? x.displayName || x.name : "", Ot = Kt ? Le(Kt) : "";
      return typeof x == "function" && Ge.set(x, Ot), Ot;
    }
    function Dt(x, M, V) {
      return tt(x, !1);
    }
    function I(x) {
      var M = x.prototype;
      return !!(M && M.isReactComponent);
    }
    function K(x, M, V) {
      if (x == null)
        return "";
      if (typeof x == "function")
        return tt(x, I(x));
      if (typeof x == "string")
        return Le(x);
      switch (x) {
        case u:
          return Le("Suspense");
        case d:
          return Le("SuspenseList");
      }
      if (typeof x == "object")
        switch (x.$$typeof) {
          case c:
            return Dt(x.render);
          case m:
            return K(x.type, M, V);
          case h: {
            var H = x, ce = H._payload, fe = H._init;
            try {
              return K(fe(ce), M, V);
            } catch {
            }
          }
        }
      return "";
    }
    var ae = Object.prototype.hasOwnProperty, Te = {}, X = j.ReactDebugCurrentFrame;
    function se(x) {
      if (x) {
        var M = x._owner, V = K(x.type, x._source, M ? M.type : null);
        X.setExtraStackFrame(V);
      } else
        X.setExtraStackFrame(null);
    }
    function he(x, M, V, H, ce) {
      {
        var fe = Function.call.bind(ae);
        for (var ie in x)
          if (fe(x, ie)) {
            var ne = void 0;
            try {
              if (typeof x[ie] != "function") {
                var Xe = Error((H || "React class") + ": " + V + " type `" + ie + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof x[ie] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                throw Xe.name = "Invariant Violation", Xe;
              }
              ne = x[ie](M, ie, H, V, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
            } catch (Pe) {
              ne = Pe;
            }
            ne && !(ne instanceof Error) && (se(ce), b("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", H || "React class", V, ie, typeof ne), se(null)), ne instanceof Error && !(ne.message in Te) && (Te[ne.message] = !0, se(ce), b("Failed %s type: %s", V, ne.message), se(null));
          }
      }
    }
    var Se = Array.isArray;
    function ct(x) {
      return Se(x);
    }
    function kt(x) {
      {
        var M = typeof Symbol == "function" && Symbol.toStringTag, V = M && x[Symbol.toStringTag] || x.constructor.name || "Object";
        return V;
      }
    }
    function vt(x) {
      try {
        return Gt(x), !1;
      } catch {
        return !0;
      }
    }
    function Gt(x) {
      return "" + x;
    }
    function qs(x) {
      if (vt(x))
        return b("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", kt(x)), Gt(x);
    }
    var Xs = j.ReactCurrentOwner, Zs = {
      key: !0,
      ref: !0,
      __self: !0,
      __source: !0
    }, Qs, vs;
    function Ke(x) {
      if (ae.call(x, "ref")) {
        var M = Object.getOwnPropertyDescriptor(x, "ref").get;
        if (M && M.isReactWarning)
          return !1;
      }
      return x.ref !== void 0;
    }
    function Js(x) {
      if (ae.call(x, "key")) {
        var M = Object.getOwnPropertyDescriptor(x, "key").get;
        if (M && M.isReactWarning)
          return !1;
      }
      return x.key !== void 0;
    }
    function en(x, M) {
      typeof x.ref == "string" && Xs.current;
    }
    function Jn(x, M) {
      {
        var V = function() {
          Qs || (Qs = !0, b("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", M));
        };
        V.isReactWarning = !0, Object.defineProperty(x, "key", {
          get: V,
          configurable: !0
        });
      }
    }
    function ys(x, M) {
      {
        var V = function() {
          vs || (vs = !0, b("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", M));
        };
        V.isReactWarning = !0, Object.defineProperty(x, "ref", {
          get: V,
          configurable: !0
        });
      }
    }
    var C = function(x, M, V, H, ce, fe, ie) {
      var ne = {
        // This tag allows us to uniquely identify this as a React Element
        $$typeof: t,
        // Built-in properties that belong on the element
        type: x,
        key: M,
        ref: V,
        props: ie,
        // Record the component responsible for creating this element.
        _owner: fe
      };
      return ne._store = {}, Object.defineProperty(ne._store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: !1
      }), Object.defineProperty(ne, "_self", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: H
      }), Object.defineProperty(ne, "_source", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: ce
      }), Object.freeze && (Object.freeze(ne.props), Object.freeze(ne)), ne;
    };
    function R(x, M, V, H, ce) {
      {
        var fe, ie = {}, ne = null, Xe = null;
        V !== void 0 && (qs(V), ne = "" + V), Js(M) && (qs(M.key), ne = "" + M.key), Ke(M) && (Xe = M.ref, en(M, ce));
        for (fe in M)
          ae.call(M, fe) && !Zs.hasOwnProperty(fe) && (ie[fe] = M[fe]);
        if (x && x.defaultProps) {
          var Pe = x.defaultProps;
          for (fe in Pe)
            ie[fe] === void 0 && (ie[fe] = Pe[fe]);
        }
        if (ne || Xe) {
          var Re = typeof x == "function" ? x.displayName || x.name || "Unknown" : x;
          ne && Jn(ie, Re), Xe && ys(ie, Re);
        }
        return C(x, ne, Xe, ce, H, Xs.current, ie);
      }
    }
    var $ = j.ReactCurrentOwner, F = j.ReactDebugCurrentFrame;
    function ue(x) {
      if (x) {
        var M = x._owner, V = K(x.type, x._source, M ? M.type : null);
        F.setExtraStackFrame(V);
      } else
        F.setExtraStackFrame(null);
    }
    var De;
    De = !1;
    function Ye(x) {
      return typeof x == "object" && x !== null && x.$$typeof === t;
    }
    function qe() {
      {
        if ($.current) {
          var x = be($.current.type);
          if (x)
            return `

Check the render method of \`` + x + "`.";
        }
        return "";
      }
    }
    function Ae(x) {
      return "";
    }
    var Fe = {};
    function er(x) {
      {
        var M = qe();
        if (!M) {
          var V = typeof x == "string" ? x : x.displayName || x.name;
          V && (M = `

Check the top-level render call using <` + V + ">.");
        }
        return M;
      }
    }
    function tn(x, M) {
      {
        if (!x._store || x._store.validated || x.key != null)
          return;
        x._store.validated = !0;
        var V = er(M);
        if (Fe[V])
          return;
        Fe[V] = !0;
        var H = "";
        x && x._owner && x._owner !== $.current && (H = " It was passed a child from " + be(x._owner.type) + "."), ue(x), b('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', V, H), ue(null);
      }
    }
    function sn(x, M) {
      {
        if (typeof x != "object")
          return;
        if (ct(x))
          for (var V = 0; V < x.length; V++) {
            var H = x[V];
            Ye(H) && tn(H, M);
          }
        else if (Ye(x))
          x._store && (x._store.validated = !0);
        else if (x) {
          var ce = N(x);
          if (typeof ce == "function" && ce !== x.entries)
            for (var fe = ce.call(x), ie; !(ie = fe.next()).done; )
              Ye(ie.value) && tn(ie.value, M);
        }
      }
    }
    function xu(x) {
      {
        var M = x.type;
        if (M == null || typeof M == "string")
          return;
        var V;
        if (typeof M == "function")
          V = M.propTypes;
        else if (typeof M == "object" && (M.$$typeof === c || // Note: Memo only checks outer props here.
        // Inner props are checked in the reconciler.
        M.$$typeof === m))
          V = M.propTypes;
        else
          return;
        if (V) {
          var H = be(M);
          he(V, x.props, "prop", H, x);
        } else if (M.PropTypes !== void 0 && !De) {
          De = !0;
          var ce = be(M);
          b("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", ce || "Unknown");
        }
        typeof M.getDefaultProps == "function" && !M.getDefaultProps.isReactClassApproved && b("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
      }
    }
    function gu(x) {
      {
        for (var M = Object.keys(x.props), V = 0; V < M.length; V++) {
          var H = M[V];
          if (H !== "children" && H !== "key") {
            ue(x), b("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", H), ue(null);
            break;
          }
        }
        x.ref !== null && (ue(x), b("Invalid attribute `ref` supplied to `React.Fragment`."), ue(null));
      }
    }
    var ta = {};
    function sa(x, M, V, H, ce, fe) {
      {
        var ie = O(x);
        if (!ie) {
          var ne = "";
          (x === void 0 || typeof x == "object" && x !== null && Object.keys(x).length === 0) && (ne += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.");
          var Xe = Ae();
          Xe ? ne += Xe : ne += qe();
          var Pe;
          x === null ? Pe = "null" : ct(x) ? Pe = "array" : x !== void 0 && x.$$typeof === t ? (Pe = "<" + (be(x.type) || "Unknown") + " />", ne = " Did you accidentally export a JSX literal instead of a component?") : Pe = typeof x, b("React.jsx: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", Pe, ne);
        }
        var Re = R(x, M, V, ce, fe);
        if (Re == null)
          return Re;
        if (ie) {
          var nt = M.children;
          if (nt !== void 0)
            if (H)
              if (ct(nt)) {
                for (var Kt = 0; Kt < nt.length; Kt++)
                  sn(nt[Kt], x);
                Object.freeze && Object.freeze(nt);
              } else
                b("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
            else
              sn(nt, x);
        }
        if (ae.call(M, "key")) {
          var Ot = be(x), Je = Object.keys(M).filter(function(Nu) {
            return Nu !== "key";
          }), tr = Je.length > 0 ? "{key: someKey, " + Je.join(": ..., ") + ": ...}" : "{key: someKey}";
          if (!ta[Ot + tr]) {
            var wu = Je.length > 0 ? "{" + Je.join(": ..., ") + ": ...}" : "{}";
            b(`A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`, tr, Ot, wu, Ot), ta[Ot + tr] = !0;
          }
        }
        return x === r ? gu(Re) : xu(Re), Re;
      }
    }
    function bu(x, M, V) {
      return sa(x, M, V, !0);
    }
    function vu(x, M, V) {
      return sa(x, M, V, !1);
    }
    var yu = vu, ju = bu;
    ws.Fragment = r, ws.jsx = yu, ws.jsxs = ju;
  })()), ws;
}
var ia;
function Mu() {
  return ia || (ia = 1, process.env.NODE_ENV === "production" ? nn.exports = Au() : nn.exports = Ru()), nn.exports;
}
var s = Mu();
const ui = us({});
function mi(e) {
  const t = at(null);
  return t.current === null && (t.current = e()), t.current;
}
const hi = typeof window < "u", Zo = hi ? Cu : li, Bn = /* @__PURE__ */ us(null);
function fi(e, t) {
  e.indexOf(t) === -1 && e.push(t);
}
function pi(e, t) {
  const n = e.indexOf(t);
  n > -1 && e.splice(n, 1);
}
const Nt = (e, t, n) => n > t ? t : n < e ? e : n;
function Rr(e, t) {
  return t ? `${e}. For more information and steps for solving, visit https://motion.dev/troubleshooting/${t}` : e;
}
let ms = () => {
}, Ct = () => {
};
process.env.NODE_ENV !== "production" && (ms = (e, t, n) => {
  !e && typeof console < "u" && console.warn(Rr(t, n));
}, Ct = (e, t, n) => {
  if (!e)
    throw new Error(Rr(t, n));
});
const St = {}, Qo = (e) => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(e);
function Jo(e) {
  return typeof e == "object" && e !== null;
}
const el = (e) => /^0[^.\s]+$/u.test(e);
// @__NO_SIDE_EFFECTS__
function xi(e) {
  let t;
  return () => (t === void 0 && (t = e()), t);
}
const ot = /* @__NO_SIDE_EFFECTS__ */ (e) => e, Iu = (e, t) => (n) => t(e(n)), Us = (...e) => e.reduce(Iu), Ls = /* @__NO_SIDE_EFFECTS__ */ (e, t, n) => {
  const r = t - e;
  return r === 0 ? 1 : (n - e) / r;
};
class gi {
  constructor() {
    this.subscriptions = [];
  }
  add(t) {
    return fi(this.subscriptions, t), () => pi(this.subscriptions, t);
  }
  notify(t, n, r) {
    const i = this.subscriptions.length;
    if (i)
      if (i === 1)
        this.subscriptions[0](t, n, r);
      else
        for (let a = 0; a < i; a++) {
          const o = this.subscriptions[a];
          o && o(t, n, r);
        }
  }
  getSize() {
    return this.subscriptions.length;
  }
  clear() {
    this.subscriptions.length = 0;
  }
}
const ut = /* @__NO_SIDE_EFFECTS__ */ (e) => e * 1e3, pt = /* @__NO_SIDE_EFFECTS__ */ (e) => e / 1e3;
function tl(e, t) {
  return t ? e * (1e3 / t) : 0;
}
const aa = /* @__PURE__ */ new Set();
function bi(e, t, n) {
  e || aa.has(t) || (console.warn(Rr(t, n)), aa.add(t));
}
const sl = (e, t, n) => (((1 - 3 * n + 3 * t) * e + (3 * n - 6 * t)) * e + 3 * t) * e, Du = 1e-7, Ou = 12;
function Vu(e, t, n, r, i) {
  let a, o, l = 0;
  do
    o = t + (n - t) / 2, a = sl(o, r, i) - e, a > 0 ? n = o : t = o;
  while (Math.abs(a) > Du && ++l < Ou);
  return o;
}
function Hs(e, t, n, r) {
  if (e === t && n === r)
    return ot;
  const i = (a) => Vu(a, 0, 1, e, n);
  return (a) => a === 0 || a === 1 ? a : sl(i(a), t, r);
}
const nl = (e) => (t) => t <= 0.5 ? e(2 * t) / 2 : (2 - e(2 * (1 - t))) / 2, rl = (e) => (t) => 1 - e(1 - t), il = /* @__PURE__ */ Hs(0.33, 1.53, 0.69, 0.99), vi = /* @__PURE__ */ rl(il), al = /* @__PURE__ */ nl(vi), ol = (e) => (e *= 2) < 1 ? 0.5 * vi(e) : 0.5 * (2 - Math.pow(2, -10 * (e - 1))), yi = (e) => 1 - Math.sin(Math.acos(e)), ll = rl(yi), cl = nl(yi), Lu = /* @__PURE__ */ Hs(0.42, 0, 1, 1), Fu = /* @__PURE__ */ Hs(0, 0, 0.58, 1), dl = /* @__PURE__ */ Hs(0.42, 0, 0.58, 1), zu = (e) => Array.isArray(e) && typeof e[0] != "number", ul = (e) => Array.isArray(e) && typeof e[0] == "number", oa = {
  linear: ot,
  easeIn: Lu,
  easeInOut: dl,
  easeOut: Fu,
  circIn: yi,
  circInOut: cl,
  circOut: ll,
  backIn: vi,
  backInOut: al,
  backOut: il,
  anticipate: ol
}, _u = (e) => typeof e == "string", la = (e) => {
  if (ul(e)) {
    Ct(e.length === 4, "Cubic bezier arrays must contain four numerical values.", "cubic-bezier-length");
    const [t, n, r, i] = e;
    return Hs(t, n, r, i);
  } else if (_u(e))
    return Ct(oa[e] !== void 0, `Invalid easing type '${e}'`, "invalid-easing-type"), oa[e];
  return e;
}, rn = [
  "setup",
  // Compute
  "read",
  // Read
  "resolveKeyframes",
  // Write/Read/Write/Read
  "preUpdate",
  // Compute
  "update",
  // Compute
  "preRender",
  // Compute
  "render",
  // Write
  "postRender"
  // Compute
];
function $u(e, t) {
  let n = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Set(), i = !1, a = !1;
  const o = /* @__PURE__ */ new WeakSet();
  let l = {
    delta: 0,
    timestamp: 0,
    isProcessing: !1
  };
  function c(d) {
    o.has(d) && (u.schedule(d), e()), d(l);
  }
  const u = {
    /**
     * Schedule a process to run on the next frame.
     */
    schedule: (d, m = !1, h = !1) => {
      const v = h && i ? n : r;
      return m && o.add(d), v.has(d) || v.add(d), d;
    },
    /**
     * Cancel the provided callback from running on the next frame.
     */
    cancel: (d) => {
      r.delete(d), o.delete(d);
    },
    /**
     * Execute all schedule callbacks.
     */
    process: (d) => {
      if (l = d, i) {
        a = !0;
        return;
      }
      i = !0, [n, r] = [r, n], n.forEach(c), n.clear(), i = !1, a && (a = !1, u.process(d));
    }
  };
  return u;
}
const Bu = 40;
function ml(e, t) {
  let n = !1, r = !0;
  const i = {
    delta: 0,
    timestamp: 0,
    isProcessing: !1
  }, a = () => n = !0, o = rn.reduce((y, S) => (y[S] = $u(a), y), {}), { setup: l, read: c, resolveKeyframes: u, preUpdate: d, update: m, preRender: h, render: f, postRender: v } = o, g = () => {
    const y = St.useManualTiming ? i.timestamp : performance.now();
    n = !1, St.useManualTiming || (i.delta = r ? 1e3 / 60 : Math.max(Math.min(y - i.timestamp, Bu), 1)), i.timestamp = y, i.isProcessing = !0, l.process(i), c.process(i), u.process(i), d.process(i), m.process(i), h.process(i), f.process(i), v.process(i), i.isProcessing = !1, n && t && (r = !1, e(g));
  }, N = () => {
    n = !0, r = !0, i.isProcessing || e(g);
  };
  return { schedule: rn.reduce((y, S) => {
    const T = o[S];
    return y[S] = (E, A = !1, k = !1) => (n || N(), T.schedule(E, A, k)), y;
  }, {}), cancel: (y) => {
    for (let S = 0; S < rn.length; S++)
      o[rn[S]].cancel(y);
  }, state: i, steps: o };
}
const { schedule: ye, cancel: Rt, state: ze, steps: sr } = /* @__PURE__ */ ml(typeof requestAnimationFrame < "u" ? requestAnimationFrame : ot, !0);
let Sn;
function Wu() {
  Sn = void 0;
}
const et = {
  now: () => (Sn === void 0 && et.set(ze.isProcessing || St.useManualTiming ? ze.timestamp : performance.now()), Sn),
  set: (e) => {
    Sn = e, queueMicrotask(Wu);
  }
}, hl = (e) => (t) => typeof t == "string" && t.startsWith(e), ji = /* @__PURE__ */ hl("--"), Uu = /* @__PURE__ */ hl("var(--"), wi = (e) => Uu(e) ? Hu.test(e.split("/*")[0].trim()) : !1, Hu = /var\(--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)$/iu, hs = {
  test: (e) => typeof e == "number",
  parse: parseFloat,
  transform: (e) => e
}, Fs = {
  ...hs,
  transform: (e) => Nt(0, 1, e)
}, an = {
  ...hs,
  default: 1
}, Rs = (e) => Math.round(e * 1e5) / 1e5, Ni = /-?(?:\d+(?:\.\d+)?|\.\d+)/gu;
function Gu(e) {
  return e == null;
}
const Ku = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))$/iu, Ci = (e, t) => (n) => !!(typeof n == "string" && Ku.test(n) && n.startsWith(e) || t && !Gu(n) && Object.prototype.hasOwnProperty.call(n, t)), fl = (e, t, n) => (r) => {
  if (typeof r != "string")
    return r;
  const [i, a, o, l] = r.match(Ni);
  return {
    [e]: parseFloat(i),
    [t]: parseFloat(a),
    [n]: parseFloat(o),
    alpha: l !== void 0 ? parseFloat(l) : 1
  };
}, Yu = (e) => Nt(0, 255, e), nr = {
  ...hs,
  transform: (e) => Math.round(Yu(e))
}, _t = {
  test: /* @__PURE__ */ Ci("rgb", "red"),
  parse: /* @__PURE__ */ fl("red", "green", "blue"),
  transform: ({ red: e, green: t, blue: n, alpha: r = 1 }) => "rgba(" + nr.transform(e) + ", " + nr.transform(t) + ", " + nr.transform(n) + ", " + Rs(Fs.transform(r)) + ")"
};
function qu(e) {
  let t = "", n = "", r = "", i = "";
  return e.length > 5 ? (t = e.substring(1, 3), n = e.substring(3, 5), r = e.substring(5, 7), i = e.substring(7, 9)) : (t = e.substring(1, 2), n = e.substring(2, 3), r = e.substring(3, 4), i = e.substring(4, 5), t += t, n += n, r += r, i += i), {
    red: parseInt(t, 16),
    green: parseInt(n, 16),
    blue: parseInt(r, 16),
    alpha: i ? parseInt(i, 16) / 255 : 1
  };
}
const Mr = {
  test: /* @__PURE__ */ Ci("#"),
  parse: qu,
  transform: _t.transform
}, Gs = /* @__NO_SIDE_EFFECTS__ */ (e) => ({
  test: (t) => typeof t == "string" && t.endsWith(e) && t.split(" ").length === 1,
  parse: parseFloat,
  transform: (t) => `${t}${e}`
}), Pt = /* @__PURE__ */ Gs("deg"), xt = /* @__PURE__ */ Gs("%"), U = /* @__PURE__ */ Gs("px"), Xu = /* @__PURE__ */ Gs("vh"), Zu = /* @__PURE__ */ Gs("vw"), ca = {
  ...xt,
  parse: (e) => xt.parse(e) / 100,
  transform: (e) => xt.transform(e * 100)
}, es = {
  test: /* @__PURE__ */ Ci("hsl", "hue"),
  parse: /* @__PURE__ */ fl("hue", "saturation", "lightness"),
  transform: ({ hue: e, saturation: t, lightness: n, alpha: r = 1 }) => "hsla(" + Math.round(e) + ", " + xt.transform(Rs(t)) + ", " + xt.transform(Rs(n)) + ", " + Rs(Fs.transform(r)) + ")"
}, Ie = {
  test: (e) => _t.test(e) || Mr.test(e) || es.test(e),
  parse: (e) => _t.test(e) ? _t.parse(e) : es.test(e) ? es.parse(e) : Mr.parse(e),
  transform: (e) => typeof e == "string" ? e : e.hasOwnProperty("red") ? _t.transform(e) : es.transform(e),
  getAnimatableNone: (e) => {
    const t = Ie.parse(e);
    return t.alpha = 0, Ie.transform(t);
  }
}, Qu = /(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))/giu;
function Ju(e) {
  return isNaN(e) && typeof e == "string" && (e.match(Ni)?.length || 0) + (e.match(Qu)?.length || 0) > 0;
}
const pl = "number", xl = "color", em = "var", tm = "var(", da = "${}", sm = /var\s*\(\s*--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)|#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\)|-?(?:\d+(?:\.\d+)?|\.\d+)/giu;
function zs(e) {
  const t = e.toString(), n = [], r = {
    color: [],
    number: [],
    var: []
  }, i = [];
  let a = 0;
  const l = t.replace(sm, (c) => (Ie.test(c) ? (r.color.push(a), i.push(xl), n.push(Ie.parse(c))) : c.startsWith(tm) ? (r.var.push(a), i.push(em), n.push(c)) : (r.number.push(a), i.push(pl), n.push(parseFloat(c))), ++a, da)).split(da);
  return { values: n, split: l, indexes: r, types: i };
}
function gl(e) {
  return zs(e).values;
}
function bl(e) {
  const { split: t, types: n } = zs(e), r = t.length;
  return (i) => {
    let a = "";
    for (let o = 0; o < r; o++)
      if (a += t[o], i[o] !== void 0) {
        const l = n[o];
        l === pl ? a += Rs(i[o]) : l === xl ? a += Ie.transform(i[o]) : a += i[o];
      }
    return a;
  };
}
const nm = (e) => typeof e == "number" ? 0 : Ie.test(e) ? Ie.getAnimatableNone(e) : e;
function rm(e) {
  const t = gl(e);
  return bl(e)(t.map(nm));
}
const Mt = {
  test: Ju,
  parse: gl,
  createTransformer: bl,
  getAnimatableNone: rm
};
function rr(e, t, n) {
  return n < 0 && (n += 1), n > 1 && (n -= 1), n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e;
}
function im({ hue: e, saturation: t, lightness: n, alpha: r }) {
  e /= 360, t /= 100, n /= 100;
  let i = 0, a = 0, o = 0;
  if (!t)
    i = a = o = n;
  else {
    const l = n < 0.5 ? n * (1 + t) : n + t - n * t, c = 2 * n - l;
    i = rr(c, l, e + 1 / 3), a = rr(c, l, e), o = rr(c, l, e - 1 / 3);
  }
  return {
    red: Math.round(i * 255),
    green: Math.round(a * 255),
    blue: Math.round(o * 255),
    alpha: r
  };
}
function Mn(e, t) {
  return (n) => n > 0 ? t : e;
}
const Ce = (e, t, n) => e + (t - e) * n, ir = (e, t, n) => {
  const r = e * e, i = n * (t * t - r) + r;
  return i < 0 ? 0 : Math.sqrt(i);
}, am = [Mr, _t, es], om = (e) => am.find((t) => t.test(e));
function ua(e) {
  const t = om(e);
  if (ms(!!t, `'${e}' is not an animatable color. Use the equivalent color code instead.`, "color-not-animatable"), !t)
    return !1;
  let n = t.parse(e);
  return t === es && (n = im(n)), n;
}
const ma = (e, t) => {
  const n = ua(e), r = ua(t);
  if (!n || !r)
    return Mn(e, t);
  const i = { ...n };
  return (a) => (i.red = ir(n.red, r.red, a), i.green = ir(n.green, r.green, a), i.blue = ir(n.blue, r.blue, a), i.alpha = Ce(n.alpha, r.alpha, a), _t.transform(i));
}, Ir = /* @__PURE__ */ new Set(["none", "hidden"]);
function lm(e, t) {
  return Ir.has(e) ? (n) => n <= 0 ? e : t : (n) => n >= 1 ? t : e;
}
function cm(e, t) {
  return (n) => Ce(e, t, n);
}
function Si(e) {
  return typeof e == "number" ? cm : typeof e == "string" ? wi(e) ? Mn : Ie.test(e) ? ma : mm : Array.isArray(e) ? vl : typeof e == "object" ? Ie.test(e) ? ma : dm : Mn;
}
function vl(e, t) {
  const n = [...e], r = n.length, i = e.map((a, o) => Si(a)(a, t[o]));
  return (a) => {
    for (let o = 0; o < r; o++)
      n[o] = i[o](a);
    return n;
  };
}
function dm(e, t) {
  const n = { ...e, ...t }, r = {};
  for (const i in n)
    e[i] !== void 0 && t[i] !== void 0 && (r[i] = Si(e[i])(e[i], t[i]));
  return (i) => {
    for (const a in r)
      n[a] = r[a](i);
    return n;
  };
}
function um(e, t) {
  const n = [], r = { color: 0, var: 0, number: 0 };
  for (let i = 0; i < t.values.length; i++) {
    const a = t.types[i], o = e.indexes[a][r[a]], l = e.values[o] ?? 0;
    n[i] = l, r[a]++;
  }
  return n;
}
const mm = (e, t) => {
  const n = Mt.createTransformer(t), r = zs(e), i = zs(t);
  return r.indexes.var.length === i.indexes.var.length && r.indexes.color.length === i.indexes.color.length && r.indexes.number.length >= i.indexes.number.length ? Ir.has(e) && !i.values.length || Ir.has(t) && !r.values.length ? lm(e, t) : Us(vl(um(r, i), i.values), n) : (ms(!0, `Complex values '${e}' and '${t}' too different to mix. Ensure all colors are of the same type, and that each contains the same quantity of number and color values. Falling back to instant transition.`, "complex-values-different"), Mn(e, t));
};
function yl(e, t, n) {
  return typeof e == "number" && typeof t == "number" && typeof n == "number" ? Ce(e, t, n) : Si(e)(e, t);
}
const hm = (e) => {
  const t = ({ timestamp: n }) => e(n);
  return {
    start: (n = !0) => ye.update(t, n),
    stop: () => Rt(t),
    /**
     * If we're processing this frame we can use the
     * framelocked timestamp to keep things in sync.
     */
    now: () => ze.isProcessing ? ze.timestamp : et.now()
  };
}, jl = (e, t, n = 10) => {
  let r = "";
  const i = Math.max(Math.round(t / n), 2);
  for (let a = 0; a < i; a++)
    r += Math.round(e(a / (i - 1)) * 1e4) / 1e4 + ", ";
  return `linear(${r.substring(0, r.length - 2)})`;
}, In = 2e4;
function ki(e) {
  let t = 0;
  const n = 50;
  let r = e.next(t);
  for (; !r.done && t < In; )
    t += n, r = e.next(t);
  return t >= In ? 1 / 0 : t;
}
function fm(e, t = 100, n) {
  const r = n({ ...e, keyframes: [0, t] }), i = Math.min(ki(r), In);
  return {
    type: "keyframes",
    ease: (a) => r.next(i * a).value / t,
    duration: /* @__PURE__ */ pt(i)
  };
}
const pm = 5;
function wl(e, t, n) {
  const r = Math.max(t - pm, 0);
  return tl(n - e(r), t - r);
}
const Ne = {
  // Default spring physics
  stiffness: 100,
  damping: 10,
  mass: 1,
  velocity: 0,
  // Default duration/bounce-based options
  duration: 800,
  // in ms
  bounce: 0.3,
  visualDuration: 0.3,
  // in seconds
  // Rest thresholds
  restSpeed: {
    granular: 0.01,
    default: 2
  },
  restDelta: {
    granular: 5e-3,
    default: 0.5
  },
  // Limits
  minDuration: 0.01,
  // in seconds
  maxDuration: 10,
  // in seconds
  minDamping: 0.05,
  maxDamping: 1
}, ar = 1e-3;
function xm({ duration: e = Ne.duration, bounce: t = Ne.bounce, velocity: n = Ne.velocity, mass: r = Ne.mass }) {
  let i, a;
  ms(e <= /* @__PURE__ */ ut(Ne.maxDuration), "Spring duration must be 10 seconds or less", "spring-duration-limit");
  let o = 1 - t;
  o = Nt(Ne.minDamping, Ne.maxDamping, o), e = Nt(Ne.minDuration, Ne.maxDuration, /* @__PURE__ */ pt(e)), o < 1 ? (i = (u) => {
    const d = u * o, m = d * e, h = d - n, f = Dr(u, o), v = Math.exp(-m);
    return ar - h / f * v;
  }, a = (u) => {
    const m = u * o * e, h = m * n + n, f = Math.pow(o, 2) * Math.pow(u, 2) * e, v = Math.exp(-m), g = Dr(Math.pow(u, 2), o);
    return (-i(u) + ar > 0 ? -1 : 1) * ((h - f) * v) / g;
  }) : (i = (u) => {
    const d = Math.exp(-u * e), m = (u - n) * e + 1;
    return -ar + d * m;
  }, a = (u) => {
    const d = Math.exp(-u * e), m = (n - u) * (e * e);
    return d * m;
  });
  const l = 5 / e, c = bm(i, a, l);
  if (e = /* @__PURE__ */ ut(e), isNaN(c))
    return {
      stiffness: Ne.stiffness,
      damping: Ne.damping,
      duration: e
    };
  {
    const u = Math.pow(c, 2) * r;
    return {
      stiffness: u,
      damping: o * 2 * Math.sqrt(r * u),
      duration: e
    };
  }
}
const gm = 12;
function bm(e, t, n) {
  let r = n;
  for (let i = 1; i < gm; i++)
    r = r - e(r) / t(r);
  return r;
}
function Dr(e, t) {
  return e * Math.sqrt(1 - t * t);
}
const vm = ["duration", "bounce"], ym = ["stiffness", "damping", "mass"];
function ha(e, t) {
  return t.some((n) => e[n] !== void 0);
}
function jm(e) {
  let t = {
    velocity: Ne.velocity,
    stiffness: Ne.stiffness,
    damping: Ne.damping,
    mass: Ne.mass,
    isResolvedFromDuration: !1,
    ...e
  };
  if (!ha(e, ym) && ha(e, vm))
    if (e.visualDuration) {
      const n = e.visualDuration, r = 2 * Math.PI / (n * 1.2), i = r * r, a = 2 * Nt(0.05, 1, 1 - (e.bounce || 0)) * Math.sqrt(i);
      t = {
        ...t,
        mass: Ne.mass,
        stiffness: i,
        damping: a
      };
    } else {
      const n = xm(e);
      t = {
        ...t,
        ...n,
        mass: Ne.mass
      }, t.isResolvedFromDuration = !0;
    }
  return t;
}
function Dn(e = Ne.visualDuration, t = Ne.bounce) {
  const n = typeof e != "object" ? {
    visualDuration: e,
    keyframes: [0, 1],
    bounce: t
  } : e;
  let { restSpeed: r, restDelta: i } = n;
  const a = n.keyframes[0], o = n.keyframes[n.keyframes.length - 1], l = { done: !1, value: a }, { stiffness: c, damping: u, mass: d, duration: m, velocity: h, isResolvedFromDuration: f } = jm({
    ...n,
    velocity: -/* @__PURE__ */ pt(n.velocity || 0)
  }), v = h || 0, g = u / (2 * Math.sqrt(c * d)), N = o - a, j = /* @__PURE__ */ pt(Math.sqrt(c / d)), b = Math.abs(N) < 5;
  r || (r = b ? Ne.restSpeed.granular : Ne.restSpeed.default), i || (i = b ? Ne.restDelta.granular : Ne.restDelta.default);
  let y;
  if (g < 1) {
    const T = Dr(j, g);
    y = (E) => {
      const A = Math.exp(-g * j * E);
      return o - A * ((v + g * j * N) / T * Math.sin(T * E) + N * Math.cos(T * E));
    };
  } else if (g === 1)
    y = (T) => o - Math.exp(-j * T) * (N + (v + j * N) * T);
  else {
    const T = j * Math.sqrt(g * g - 1);
    y = (E) => {
      const A = Math.exp(-g * j * E), k = Math.min(T * E, 300);
      return o - A * ((v + g * j * N) * Math.sinh(k) + T * N * Math.cosh(k)) / T;
    };
  }
  const S = {
    calculatedDuration: f && m || null,
    next: (T) => {
      const E = y(T);
      if (f)
        l.done = T >= m;
      else {
        let A = T === 0 ? v : 0;
        g < 1 && (A = T === 0 ? /* @__PURE__ */ ut(v) : wl(y, T, E));
        const k = Math.abs(A) <= r, L = Math.abs(o - E) <= i;
        l.done = k && L;
      }
      return l.value = l.done ? o : E, l;
    },
    toString: () => {
      const T = Math.min(ki(S), In), E = jl((A) => S.next(T * A).value, T, 30);
      return T + "ms " + E;
    },
    toTransition: () => {
    }
  };
  return S;
}
Dn.applyToOptions = (e) => {
  const t = fm(e, 100, Dn);
  return e.ease = t.ease, e.duration = /* @__PURE__ */ ut(t.duration), e.type = "keyframes", e;
};
function Or({ keyframes: e, velocity: t = 0, power: n = 0.8, timeConstant: r = 325, bounceDamping: i = 10, bounceStiffness: a = 500, modifyTarget: o, min: l, max: c, restDelta: u = 0.5, restSpeed: d }) {
  const m = e[0], h = {
    done: !1,
    value: m
  }, f = (k) => l !== void 0 && k < l || c !== void 0 && k > c, v = (k) => l === void 0 ? c : c === void 0 || Math.abs(l - k) < Math.abs(c - k) ? l : c;
  let g = n * t;
  const N = m + g, j = o === void 0 ? N : o(N);
  j !== N && (g = j - m);
  const b = (k) => -g * Math.exp(-k / r), y = (k) => j + b(k), S = (k) => {
    const L = b(k), O = y(k);
    h.done = Math.abs(L) <= u, h.value = h.done ? j : O;
  };
  let T, E;
  const A = (k) => {
    f(h.value) && (T = k, E = Dn({
      keyframes: [h.value, v(h.value)],
      velocity: wl(y, k, h.value),
      // TODO: This should be passing * 1000
      damping: i,
      stiffness: a,
      restDelta: u,
      restSpeed: d
    }));
  };
  return A(0), {
    calculatedDuration: null,
    next: (k) => {
      let L = !1;
      return !E && T === void 0 && (L = !0, S(k), A(k)), T !== void 0 && k >= T ? E.next(k - T) : (!L && S(k), h);
    }
  };
}
function wm(e, t, n) {
  const r = [], i = n || St.mix || yl, a = e.length - 1;
  for (let o = 0; o < a; o++) {
    let l = i(e[o], e[o + 1]);
    if (t) {
      const c = Array.isArray(t) ? t[o] || ot : t;
      l = Us(c, l);
    }
    r.push(l);
  }
  return r;
}
function Nm(e, t, { clamp: n = !0, ease: r, mixer: i } = {}) {
  const a = e.length;
  if (Ct(a === t.length, "Both input and output ranges must be the same length", "range-length"), a === 1)
    return () => t[0];
  if (a === 2 && t[0] === t[1])
    return () => t[1];
  const o = e[0] === e[1];
  e[0] > e[a - 1] && (e = [...e].reverse(), t = [...t].reverse());
  const l = wm(t, r, i), c = l.length, u = (d) => {
    if (o && d < e[0])
      return t[0];
    let m = 0;
    if (c > 1)
      for (; m < e.length - 2 && !(d < e[m + 1]); m++)
        ;
    const h = /* @__PURE__ */ Ls(e[m], e[m + 1], d);
    return l[m](h);
  };
  return n ? (d) => u(Nt(e[0], e[a - 1], d)) : u;
}
function Cm(e, t) {
  const n = e[e.length - 1];
  for (let r = 1; r <= t; r++) {
    const i = /* @__PURE__ */ Ls(0, t, r);
    e.push(Ce(n, 1, i));
  }
}
function Sm(e) {
  const t = [0];
  return Cm(t, e.length - 1), t;
}
function km(e, t) {
  return e.map((n) => n * t);
}
function Tm(e, t) {
  return e.map(() => t || dl).splice(0, e.length - 1);
}
function ts({ duration: e = 300, keyframes: t, times: n, ease: r = "easeInOut" }) {
  const i = zu(r) ? r.map(la) : la(r), a = {
    done: !1,
    value: t[0]
  }, o = km(
    // Only use the provided offsets if they're the correct length
    // TODO Maybe we should warn here if there's a length mismatch
    n && n.length === t.length ? n : Sm(t),
    e
  ), l = Nm(o, t, {
    ease: Array.isArray(i) ? i : Tm(t, i)
  });
  return {
    calculatedDuration: e,
    next: (c) => (a.value = l(c), a.done = c >= e, a)
  };
}
const Pm = (e) => e !== null;
function Ti(e, { repeat: t, repeatType: n = "loop" }, r, i = 1) {
  const a = e.filter(Pm), l = i < 0 || t && n !== "loop" && t % 2 === 1 ? 0 : a.length - 1;
  return !l || r === void 0 ? a[l] : r;
}
const Em = {
  decay: Or,
  inertia: Or,
  tween: ts,
  keyframes: ts,
  spring: Dn
};
function Nl(e) {
  typeof e.type == "string" && (e.type = Em[e.type]);
}
class Pi {
  constructor() {
    this.updateFinished();
  }
  get finished() {
    return this._finished;
  }
  updateFinished() {
    this._finished = new Promise((t) => {
      this.resolve = t;
    });
  }
  notifyFinished() {
    this.resolve();
  }
  /**
   * Allows the animation to be awaited.
   *
   * @deprecated Use `finished` instead.
   */
  then(t, n) {
    return this.finished.then(t, n);
  }
}
const Am = (e) => e / 100;
class Ei extends Pi {
  constructor(t) {
    super(), this.state = "idle", this.startTime = null, this.isStopped = !1, this.currentTime = 0, this.holdTime = null, this.playbackSpeed = 1, this.stop = () => {
      const { motionValue: n } = this.options;
      n && n.updatedAt !== et.now() && this.tick(et.now()), this.isStopped = !0, this.state !== "idle" && (this.teardown(), this.options.onStop?.());
    }, this.options = t, this.initAnimation(), this.play(), t.autoplay === !1 && this.pause();
  }
  initAnimation() {
    const { options: t } = this;
    Nl(t);
    const { type: n = ts, repeat: r = 0, repeatDelay: i = 0, repeatType: a, velocity: o = 0 } = t;
    let { keyframes: l } = t;
    const c = n || ts;
    process.env.NODE_ENV !== "production" && c !== ts && Ct(l.length <= 2, `Only two keyframes currently supported with spring and inertia animations. Trying to animate ${l}`, "spring-two-frames"), c !== ts && typeof l[0] != "number" && (this.mixKeyframes = Us(Am, yl(l[0], l[1])), l = [0, 100]);
    const u = c({ ...t, keyframes: l });
    a === "mirror" && (this.mirroredGenerator = c({
      ...t,
      keyframes: [...l].reverse(),
      velocity: -o
    })), u.calculatedDuration === null && (u.calculatedDuration = ki(u));
    const { calculatedDuration: d } = u;
    this.calculatedDuration = d, this.resolvedDuration = d + i, this.totalDuration = this.resolvedDuration * (r + 1) - i, this.generator = u;
  }
  updateTime(t) {
    const n = Math.round(t - this.startTime) * this.playbackSpeed;
    this.holdTime !== null ? this.currentTime = this.holdTime : this.currentTime = n;
  }
  tick(t, n = !1) {
    const { generator: r, totalDuration: i, mixKeyframes: a, mirroredGenerator: o, resolvedDuration: l, calculatedDuration: c } = this;
    if (this.startTime === null)
      return r.next(0);
    const { delay: u = 0, keyframes: d, repeat: m, repeatType: h, repeatDelay: f, type: v, onUpdate: g, finalKeyframe: N } = this.options;
    this.speed > 0 ? this.startTime = Math.min(this.startTime, t) : this.speed < 0 && (this.startTime = Math.min(t - i / this.speed, this.startTime)), n ? this.currentTime = t : this.updateTime(t);
    const j = this.currentTime - u * (this.playbackSpeed >= 0 ? 1 : -1), b = this.playbackSpeed >= 0 ? j < 0 : j > i;
    this.currentTime = Math.max(j, 0), this.state === "finished" && this.holdTime === null && (this.currentTime = i);
    let y = this.currentTime, S = r;
    if (m) {
      const k = Math.min(this.currentTime, i) / l;
      let L = Math.floor(k), O = k % 1;
      !O && k >= 1 && (O = 1), O === 1 && L--, L = Math.min(L, m + 1), !!(L % 2) && (h === "reverse" ? (O = 1 - O, f && (O -= f / l)) : h === "mirror" && (S = o)), y = Nt(0, 1, O) * l;
    }
    const T = b ? { done: !1, value: d[0] } : S.next(y);
    a && (T.value = a(T.value));
    let { done: E } = T;
    !b && c !== null && (E = this.playbackSpeed >= 0 ? this.currentTime >= i : this.currentTime <= 0);
    const A = this.holdTime === null && (this.state === "finished" || this.state === "running" && E);
    return A && v !== Or && (T.value = Ti(d, this.options, N, this.speed)), g && g(T.value), A && this.finish(), T;
  }
  /**
   * Allows the returned animation to be awaited or promise-chained. Currently
   * resolves when the animation finishes at all but in a future update could/should
   * reject if its cancels.
   */
  then(t, n) {
    return this.finished.then(t, n);
  }
  get duration() {
    return /* @__PURE__ */ pt(this.calculatedDuration);
  }
  get time() {
    return /* @__PURE__ */ pt(this.currentTime);
  }
  set time(t) {
    t = /* @__PURE__ */ ut(t), this.currentTime = t, this.startTime === null || this.holdTime !== null || this.playbackSpeed === 0 ? this.holdTime = t : this.driver && (this.startTime = this.driver.now() - t / this.playbackSpeed), this.driver?.start(!1);
  }
  get speed() {
    return this.playbackSpeed;
  }
  set speed(t) {
    this.updateTime(et.now());
    const n = this.playbackSpeed !== t;
    this.playbackSpeed = t, n && (this.time = /* @__PURE__ */ pt(this.currentTime));
  }
  play() {
    if (this.isStopped)
      return;
    const { driver: t = hm, startTime: n } = this.options;
    this.driver || (this.driver = t((i) => this.tick(i))), this.options.onPlay?.();
    const r = this.driver.now();
    this.state === "finished" ? (this.updateFinished(), this.startTime = r) : this.holdTime !== null ? this.startTime = r - this.holdTime : this.startTime || (this.startTime = n ?? r), this.state === "finished" && this.speed < 0 && (this.startTime += this.calculatedDuration), this.holdTime = null, this.state = "running", this.driver.start();
  }
  pause() {
    this.state = "paused", this.updateTime(et.now()), this.holdTime = this.currentTime;
  }
  complete() {
    this.state !== "running" && this.play(), this.state = "finished", this.holdTime = null;
  }
  finish() {
    this.notifyFinished(), this.teardown(), this.state = "finished", this.options.onComplete?.();
  }
  cancel() {
    this.holdTime = null, this.startTime = 0, this.tick(0), this.teardown(), this.options.onCancel?.();
  }
  teardown() {
    this.state = "idle", this.stopDriver(), this.startTime = this.holdTime = null;
  }
  stopDriver() {
    this.driver && (this.driver.stop(), this.driver = void 0);
  }
  sample(t) {
    return this.startTime = 0, this.tick(t, !0);
  }
  attachTimeline(t) {
    return this.options.allowFlatten && (this.options.type = "keyframes", this.options.ease = "linear", this.initAnimation()), this.driver?.stop(), t.observe(this);
  }
}
function Rm(e) {
  for (let t = 1; t < e.length; t++)
    e[t] ?? (e[t] = e[t - 1]);
}
const $t = (e) => e * 180 / Math.PI, Vr = (e) => {
  const t = $t(Math.atan2(e[1], e[0]));
  return Lr(t);
}, Mm = {
  x: 4,
  y: 5,
  translateX: 4,
  translateY: 5,
  scaleX: 0,
  scaleY: 3,
  scale: (e) => (Math.abs(e[0]) + Math.abs(e[3])) / 2,
  rotate: Vr,
  rotateZ: Vr,
  skewX: (e) => $t(Math.atan(e[1])),
  skewY: (e) => $t(Math.atan(e[2])),
  skew: (e) => (Math.abs(e[1]) + Math.abs(e[2])) / 2
}, Lr = (e) => (e = e % 360, e < 0 && (e += 360), e), fa = Vr, pa = (e) => Math.sqrt(e[0] * e[0] + e[1] * e[1]), xa = (e) => Math.sqrt(e[4] * e[4] + e[5] * e[5]), Im = {
  x: 12,
  y: 13,
  z: 14,
  translateX: 12,
  translateY: 13,
  translateZ: 14,
  scaleX: pa,
  scaleY: xa,
  scale: (e) => (pa(e) + xa(e)) / 2,
  rotateX: (e) => Lr($t(Math.atan2(e[6], e[5]))),
  rotateY: (e) => Lr($t(Math.atan2(-e[2], e[0]))),
  rotateZ: fa,
  rotate: fa,
  skewX: (e) => $t(Math.atan(e[4])),
  skewY: (e) => $t(Math.atan(e[1])),
  skew: (e) => (Math.abs(e[1]) + Math.abs(e[4])) / 2
};
function Fr(e) {
  return e.includes("scale") ? 1 : 0;
}
function zr(e, t) {
  if (!e || e === "none")
    return Fr(t);
  const n = e.match(/^matrix3d\(([-\d.e\s,]+)\)$/u);
  let r, i;
  if (n)
    r = Im, i = n;
  else {
    const l = e.match(/^matrix\(([-\d.e\s,]+)\)$/u);
    r = Mm, i = l;
  }
  if (!i)
    return Fr(t);
  const a = r[t], o = i[1].split(",").map(Om);
  return typeof a == "function" ? a(o) : o[a];
}
const Dm = (e, t) => {
  const { transform: n = "none" } = getComputedStyle(e);
  return zr(n, t);
};
function Om(e) {
  return parseFloat(e.trim());
}
const fs = [
  "transformPerspective",
  "x",
  "y",
  "z",
  "translateX",
  "translateY",
  "translateZ",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "rotateZ",
  "skew",
  "skewX",
  "skewY"
], ps = new Set(fs), ga = (e) => e === hs || e === U, Vm = /* @__PURE__ */ new Set(["x", "y", "z"]), Lm = fs.filter((e) => !Vm.has(e));
function Fm(e) {
  const t = [];
  return Lm.forEach((n) => {
    const r = e.getValue(n);
    r !== void 0 && (t.push([n, r.get()]), r.set(n.startsWith("scale") ? 1 : 0));
  }), t;
}
const Bt = {
  // Dimensions
  width: ({ x: e }, { paddingLeft: t = "0", paddingRight: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
  height: ({ y: e }, { paddingTop: t = "0", paddingBottom: n = "0" }) => e.max - e.min - parseFloat(t) - parseFloat(n),
  top: (e, { top: t }) => parseFloat(t),
  left: (e, { left: t }) => parseFloat(t),
  bottom: ({ y: e }, { top: t }) => parseFloat(t) + (e.max - e.min),
  right: ({ x: e }, { left: t }) => parseFloat(t) + (e.max - e.min),
  // Transform
  x: (e, { transform: t }) => zr(t, "x"),
  y: (e, { transform: t }) => zr(t, "y")
};
Bt.translateX = Bt.x;
Bt.translateY = Bt.y;
const Wt = /* @__PURE__ */ new Set();
let _r = !1, $r = !1, Br = !1;
function Cl() {
  if ($r) {
    const e = Array.from(Wt).filter((r) => r.needsMeasurement), t = new Set(e.map((r) => r.element)), n = /* @__PURE__ */ new Map();
    t.forEach((r) => {
      const i = Fm(r);
      i.length && (n.set(r, i), r.render());
    }), e.forEach((r) => r.measureInitialState()), t.forEach((r) => {
      r.render();
      const i = n.get(r);
      i && i.forEach(([a, o]) => {
        r.getValue(a)?.set(o);
      });
    }), e.forEach((r) => r.measureEndState()), e.forEach((r) => {
      r.suspendedScrollY !== void 0 && window.scrollTo(0, r.suspendedScrollY);
    });
  }
  $r = !1, _r = !1, Wt.forEach((e) => e.complete(Br)), Wt.clear();
}
function Sl() {
  Wt.forEach((e) => {
    e.readKeyframes(), e.needsMeasurement && ($r = !0);
  });
}
function zm() {
  Br = !0, Sl(), Cl(), Br = !1;
}
class Ai {
  constructor(t, n, r, i, a, o = !1) {
    this.state = "pending", this.isAsync = !1, this.needsMeasurement = !1, this.unresolvedKeyframes = [...t], this.onComplete = n, this.name = r, this.motionValue = i, this.element = a, this.isAsync = o;
  }
  scheduleResolve() {
    this.state = "scheduled", this.isAsync ? (Wt.add(this), _r || (_r = !0, ye.read(Sl), ye.resolveKeyframes(Cl))) : (this.readKeyframes(), this.complete());
  }
  readKeyframes() {
    const { unresolvedKeyframes: t, name: n, element: r, motionValue: i } = this;
    if (t[0] === null) {
      const a = i?.get(), o = t[t.length - 1];
      if (a !== void 0)
        t[0] = a;
      else if (r && n) {
        const l = r.readValue(n, o);
        l != null && (t[0] = l);
      }
      t[0] === void 0 && (t[0] = o), i && a === void 0 && i.set(t[0]);
    }
    Rm(t);
  }
  setFinalKeyframe() {
  }
  measureInitialState() {
  }
  renderEndStyles() {
  }
  measureEndState() {
  }
  complete(t = !1) {
    this.state = "complete", this.onComplete(this.unresolvedKeyframes, this.finalKeyframe, t), Wt.delete(this);
  }
  cancel() {
    this.state === "scheduled" && (Wt.delete(this), this.state = "pending");
  }
  resume() {
    this.state === "pending" && this.scheduleResolve();
  }
}
const _m = (e) => e.startsWith("--");
function $m(e, t, n) {
  _m(t) ? e.style.setProperty(t, n) : e.style[t] = n;
}
const Bm = /* @__PURE__ */ xi(() => window.ScrollTimeline !== void 0), Wm = {};
function Um(e, t) {
  const n = /* @__PURE__ */ xi(e);
  return () => Wm[t] ?? n();
}
const kl = /* @__PURE__ */ Um(() => {
  try {
    document.createElement("div").animate({ opacity: 0 }, { easing: "linear(0, 1)" });
  } catch {
    return !1;
  }
  return !0;
}, "linearEasing"), Ps = ([e, t, n, r]) => `cubic-bezier(${e}, ${t}, ${n}, ${r})`, ba = {
  linear: "linear",
  ease: "ease",
  easeIn: "ease-in",
  easeOut: "ease-out",
  easeInOut: "ease-in-out",
  circIn: /* @__PURE__ */ Ps([0, 0.65, 0.55, 1]),
  circOut: /* @__PURE__ */ Ps([0.55, 0, 1, 0.45]),
  backIn: /* @__PURE__ */ Ps([0.31, 0.01, 0.66, -0.59]),
  backOut: /* @__PURE__ */ Ps([0.33, 1.53, 0.69, 0.99])
};
function Tl(e, t) {
  if (e)
    return typeof e == "function" ? kl() ? jl(e, t) : "ease-out" : ul(e) ? Ps(e) : Array.isArray(e) ? e.map((n) => Tl(n, t) || ba.easeOut) : ba[e];
}
function Hm(e, t, n, { delay: r = 0, duration: i = 300, repeat: a = 0, repeatType: o = "loop", ease: l = "easeOut", times: c } = {}, u = void 0) {
  const d = {
    [t]: n
  };
  c && (d.offset = c);
  const m = Tl(l, i);
  Array.isArray(m) && (d.easing = m);
  const h = {
    delay: r,
    duration: i,
    easing: Array.isArray(m) ? "linear" : m,
    fill: "both",
    iterations: a + 1,
    direction: o === "reverse" ? "alternate" : "normal"
  };
  return u && (h.pseudoElement = u), e.animate(d, h);
}
function Pl(e) {
  return typeof e == "function" && "applyToOptions" in e;
}
function Gm({ type: e, ...t }) {
  return Pl(e) && kl() ? e.applyToOptions(t) : (t.duration ?? (t.duration = 300), t.ease ?? (t.ease = "easeOut"), t);
}
class Km extends Pi {
  constructor(t) {
    if (super(), this.finishedTime = null, this.isStopped = !1, !t)
      return;
    const { element: n, name: r, keyframes: i, pseudoElement: a, allowFlatten: o = !1, finalKeyframe: l, onComplete: c } = t;
    this.isPseudoElement = !!a, this.allowFlatten = o, this.options = t, Ct(typeof t.type != "string", `Mini animate() doesn't support "type" as a string.`, "mini-spring");
    const u = Gm(t);
    this.animation = Hm(n, r, i, u, a), u.autoplay === !1 && this.animation.pause(), this.animation.onfinish = () => {
      if (this.finishedTime = this.time, !a) {
        const d = Ti(i, this.options, l, this.speed);
        this.updateMotionValue ? this.updateMotionValue(d) : $m(n, r, d), this.animation.cancel();
      }
      c?.(), this.notifyFinished();
    };
  }
  play() {
    this.isStopped || (this.animation.play(), this.state === "finished" && this.updateFinished());
  }
  pause() {
    this.animation.pause();
  }
  complete() {
    this.animation.finish?.();
  }
  cancel() {
    try {
      this.animation.cancel();
    } catch {
    }
  }
  stop() {
    if (this.isStopped)
      return;
    this.isStopped = !0;
    const { state: t } = this;
    t === "idle" || t === "finished" || (this.updateMotionValue ? this.updateMotionValue() : this.commitStyles(), this.isPseudoElement || this.cancel());
  }
  /**
   * WAAPI doesn't natively have any interruption capabilities.
   *
   * In this method, we commit styles back to the DOM before cancelling
   * the animation.
   *
   * This is designed to be overridden by NativeAnimationExtended, which
   * will create a renderless JS animation and sample it twice to calculate
   * its current value, "previous" value, and therefore allow
   * Motion to also correctly calculate velocity for any subsequent animation
   * while deferring the commit until the next animation frame.
   */
  commitStyles() {
    this.isPseudoElement || this.animation.commitStyles?.();
  }
  get duration() {
    const t = this.animation.effect?.getComputedTiming?.().duration || 0;
    return /* @__PURE__ */ pt(Number(t));
  }
  get time() {
    return /* @__PURE__ */ pt(Number(this.animation.currentTime) || 0);
  }
  set time(t) {
    this.finishedTime = null, this.animation.currentTime = /* @__PURE__ */ ut(t);
  }
  /**
   * The playback speed of the animation.
   * 1 = normal speed, 2 = double speed, 0.5 = half speed.
   */
  get speed() {
    return this.animation.playbackRate;
  }
  set speed(t) {
    t < 0 && (this.finishedTime = null), this.animation.playbackRate = t;
  }
  get state() {
    return this.finishedTime !== null ? "finished" : this.animation.playState;
  }
  get startTime() {
    return Number(this.animation.startTime);
  }
  set startTime(t) {
    this.animation.startTime = t;
  }
  /**
   * Attaches a timeline to the animation, for instance the `ScrollTimeline`.
   */
  attachTimeline({ timeline: t, observe: n }) {
    return this.allowFlatten && this.animation.effect?.updateTiming({ easing: "linear" }), this.animation.onfinish = null, t && Bm() ? (this.animation.timeline = t, ot) : n(this);
  }
}
const El = {
  anticipate: ol,
  backInOut: al,
  circInOut: cl
};
function Ym(e) {
  return e in El;
}
function qm(e) {
  typeof e.ease == "string" && Ym(e.ease) && (e.ease = El[e.ease]);
}
const va = 10;
class Xm extends Km {
  constructor(t) {
    qm(t), Nl(t), super(t), t.startTime && (this.startTime = t.startTime), this.options = t;
  }
  /**
   * WAAPI doesn't natively have any interruption capabilities.
   *
   * Rather than read commited styles back out of the DOM, we can
   * create a renderless JS animation and sample it twice to calculate
   * its current value, "previous" value, and therefore allow
   * Motion to calculate velocity for any subsequent animation.
   */
  updateMotionValue(t) {
    const { motionValue: n, onUpdate: r, onComplete: i, element: a, ...o } = this.options;
    if (!n)
      return;
    if (t !== void 0) {
      n.set(t);
      return;
    }
    const l = new Ei({
      ...o,
      autoplay: !1
    }), c = /* @__PURE__ */ ut(this.finishedTime ?? this.time);
    n.setWithVelocity(l.sample(c - va).value, l.sample(c).value, va), l.stop();
  }
}
const ya = (e, t) => t === "zIndex" ? !1 : !!(typeof e == "number" || Array.isArray(e) || typeof e == "string" && // It's animatable if we have a string
(Mt.test(e) || e === "0") && // And it contains numbers and/or colors
!e.startsWith("url("));
function Zm(e) {
  const t = e[0];
  if (e.length === 1)
    return !0;
  for (let n = 0; n < e.length; n++)
    if (e[n] !== t)
      return !0;
}
function Qm(e, t, n, r) {
  const i = e[0];
  if (i === null)
    return !1;
  if (t === "display" || t === "visibility")
    return !0;
  const a = e[e.length - 1], o = ya(i, t), l = ya(a, t);
  return ms(o === l, `You are trying to animate ${t} from "${i}" to "${a}". "${o ? a : i}" is not an animatable value.`, "value-not-animatable"), !o || !l ? !1 : Zm(e) || (n === "spring" || Pl(n)) && r;
}
function Wr(e) {
  e.duration = 0, e.type;
}
const Jm = /* @__PURE__ */ new Set([
  "opacity",
  "clipPath",
  "filter",
  "transform"
  // TODO: Could be re-enabled now we have support for linear() easing
  // "background-color"
]), eh = /* @__PURE__ */ xi(() => Object.hasOwnProperty.call(Element.prototype, "animate"));
function th(e) {
  const { motionValue: t, name: n, repeatDelay: r, repeatType: i, damping: a, type: o } = e;
  if (!(t?.owner?.current instanceof HTMLElement))
    return !1;
  const { onUpdate: c, transformTemplate: u } = t.owner.getProps();
  return eh() && n && Jm.has(n) && (n !== "transform" || !u) && /**
   * If we're outputting values to onUpdate then we can't use WAAPI as there's
   * no way to read the value from WAAPI every frame.
   */
  !c && !r && i !== "mirror" && a !== 0 && o !== "inertia";
}
const sh = 40;
class nh extends Pi {
  constructor({ autoplay: t = !0, delay: n = 0, type: r = "keyframes", repeat: i = 0, repeatDelay: a = 0, repeatType: o = "loop", keyframes: l, name: c, motionValue: u, element: d, ...m }) {
    super(), this.stop = () => {
      this._animation && (this._animation.stop(), this.stopTimeline?.()), this.keyframeResolver?.cancel();
    }, this.createdAt = et.now();
    const h = {
      autoplay: t,
      delay: n,
      type: r,
      repeat: i,
      repeatDelay: a,
      repeatType: o,
      name: c,
      motionValue: u,
      element: d,
      ...m
    }, f = d?.KeyframeResolver || Ai;
    this.keyframeResolver = new f(l, (v, g, N) => this.onKeyframesResolved(v, g, h, !N), c, u, d), this.keyframeResolver?.scheduleResolve();
  }
  onKeyframesResolved(t, n, r, i) {
    this.keyframeResolver = void 0;
    const { name: a, type: o, velocity: l, delay: c, isHandoff: u, onUpdate: d } = r;
    this.resolvedAt = et.now(), Qm(t, a, o, l) || ((St.instantAnimations || !c) && d?.(Ti(t, r, n)), t[0] = t[t.length - 1], Wr(r), r.repeat = 0);
    const h = {
      startTime: i ? this.resolvedAt ? this.resolvedAt - this.createdAt > sh ? this.resolvedAt : this.createdAt : this.createdAt : void 0,
      finalKeyframe: n,
      ...r,
      keyframes: t
    }, f = !u && th(h) ? new Xm({
      ...h,
      element: h.motionValue.owner.current
    }) : new Ei(h);
    f.finished.then(() => this.notifyFinished()).catch(ot), this.pendingTimeline && (this.stopTimeline = f.attachTimeline(this.pendingTimeline), this.pendingTimeline = void 0), this._animation = f;
  }
  get finished() {
    return this._animation ? this.animation.finished : this._finished;
  }
  then(t, n) {
    return this.finished.finally(t).then(() => {
    });
  }
  get animation() {
    return this._animation || (this.keyframeResolver?.resume(), zm()), this._animation;
  }
  get duration() {
    return this.animation.duration;
  }
  get time() {
    return this.animation.time;
  }
  set time(t) {
    this.animation.time = t;
  }
  get speed() {
    return this.animation.speed;
  }
  get state() {
    return this.animation.state;
  }
  set speed(t) {
    this.animation.speed = t;
  }
  get startTime() {
    return this.animation.startTime;
  }
  attachTimeline(t) {
    return this._animation ? this.stopTimeline = this.animation.attachTimeline(t) : this.pendingTimeline = t, () => this.stop();
  }
  play() {
    this.animation.play();
  }
  pause() {
    this.animation.pause();
  }
  complete() {
    this.animation.complete();
  }
  cancel() {
    this._animation && this.animation.cancel(), this.keyframeResolver?.cancel();
  }
}
const rh = (
  // eslint-disable-next-line redos-detector/no-unsafe-regex -- false positive, as it can match a lot of words
  /^var\(--(?:([\w-]+)|([\w-]+), ?([a-zA-Z\d ()%#.,-]+))\)/u
);
function ih(e) {
  const t = rh.exec(e);
  if (!t)
    return [,];
  const [, n, r, i] = t;
  return [`--${n ?? r}`, i];
}
const ah = 4;
function Al(e, t, n = 1) {
  Ct(n <= ah, `Max CSS variable fallback depth detected in property "${e}". This may indicate a circular fallback dependency.`, "max-css-var-depth");
  const [r, i] = ih(e);
  if (!r)
    return;
  const a = window.getComputedStyle(t).getPropertyValue(r);
  if (a) {
    const o = a.trim();
    return Qo(o) ? parseFloat(o) : o;
  }
  return wi(i) ? Al(i, t, n + 1) : i;
}
function Ri(e, t) {
  return e?.[t] ?? e?.default ?? e;
}
const Rl = /* @__PURE__ */ new Set([
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  ...fs
]), oh = {
  test: (e) => e === "auto",
  parse: (e) => e
}, Ml = (e) => (t) => t.test(e), Il = [hs, U, xt, Pt, Zu, Xu, oh], ja = (e) => Il.find(Ml(e));
function lh(e) {
  return typeof e == "number" ? e === 0 : e !== null ? e === "none" || e === "0" || el(e) : !0;
}
const ch = /* @__PURE__ */ new Set(["brightness", "contrast", "saturate", "opacity"]);
function dh(e) {
  const [t, n] = e.slice(0, -1).split("(");
  if (t === "drop-shadow")
    return e;
  const [r] = n.match(Ni) || [];
  if (!r)
    return e;
  const i = n.replace(r, "");
  let a = ch.has(t) ? 1 : 0;
  return r !== n && (a *= 100), t + "(" + a + i + ")";
}
const uh = /\b([a-z-]*)\(.*?\)/gu, Ur = {
  ...Mt,
  getAnimatableNone: (e) => {
    const t = e.match(uh);
    return t ? t.map(dh).join(" ") : e;
  }
}, wa = {
  ...hs,
  transform: Math.round
}, mh = {
  rotate: Pt,
  rotateX: Pt,
  rotateY: Pt,
  rotateZ: Pt,
  scale: an,
  scaleX: an,
  scaleY: an,
  scaleZ: an,
  skew: Pt,
  skewX: Pt,
  skewY: Pt,
  distance: U,
  translateX: U,
  translateY: U,
  translateZ: U,
  x: U,
  y: U,
  z: U,
  perspective: U,
  transformPerspective: U,
  opacity: Fs,
  originX: ca,
  originY: ca,
  originZ: U
}, Mi = {
  // Border props
  borderWidth: U,
  borderTopWidth: U,
  borderRightWidth: U,
  borderBottomWidth: U,
  borderLeftWidth: U,
  borderRadius: U,
  radius: U,
  borderTopLeftRadius: U,
  borderTopRightRadius: U,
  borderBottomRightRadius: U,
  borderBottomLeftRadius: U,
  // Positioning props
  width: U,
  maxWidth: U,
  height: U,
  maxHeight: U,
  top: U,
  right: U,
  bottom: U,
  left: U,
  // Spacing props
  padding: U,
  paddingTop: U,
  paddingRight: U,
  paddingBottom: U,
  paddingLeft: U,
  margin: U,
  marginTop: U,
  marginRight: U,
  marginBottom: U,
  marginLeft: U,
  // Misc
  backgroundPositionX: U,
  backgroundPositionY: U,
  ...mh,
  zIndex: wa,
  // SVG
  fillOpacity: Fs,
  strokeOpacity: Fs,
  numOctaves: wa
}, hh = {
  ...Mi,
  // Color props
  color: Ie,
  backgroundColor: Ie,
  outlineColor: Ie,
  fill: Ie,
  stroke: Ie,
  // Border props
  borderColor: Ie,
  borderTopColor: Ie,
  borderRightColor: Ie,
  borderBottomColor: Ie,
  borderLeftColor: Ie,
  filter: Ur,
  WebkitFilter: Ur
}, Dl = (e) => hh[e];
function Ol(e, t) {
  let n = Dl(e);
  return n !== Ur && (n = Mt), n.getAnimatableNone ? n.getAnimatableNone(t) : void 0;
}
const fh = /* @__PURE__ */ new Set(["auto", "none", "0"]);
function ph(e, t, n) {
  let r = 0, i;
  for (; r < e.length && !i; ) {
    const a = e[r];
    typeof a == "string" && !fh.has(a) && zs(a).values.length && (i = e[r]), r++;
  }
  if (i && n)
    for (const a of t)
      e[a] = Ol(n, i);
}
class xh extends Ai {
  constructor(t, n, r, i, a) {
    super(t, n, r, i, a, !0);
  }
  readKeyframes() {
    const { unresolvedKeyframes: t, element: n, name: r } = this;
    if (!n || !n.current)
      return;
    super.readKeyframes();
    for (let c = 0; c < t.length; c++) {
      let u = t[c];
      if (typeof u == "string" && (u = u.trim(), wi(u))) {
        const d = Al(u, n.current);
        d !== void 0 && (t[c] = d), c === t.length - 1 && (this.finalKeyframe = u);
      }
    }
    if (this.resolveNoneKeyframes(), !Rl.has(r) || t.length !== 2)
      return;
    const [i, a] = t, o = ja(i), l = ja(a);
    if (o !== l)
      if (ga(o) && ga(l))
        for (let c = 0; c < t.length; c++) {
          const u = t[c];
          typeof u == "string" && (t[c] = parseFloat(u));
        }
      else Bt[r] && (this.needsMeasurement = !0);
  }
  resolveNoneKeyframes() {
    const { unresolvedKeyframes: t, name: n } = this, r = [];
    for (let i = 0; i < t.length; i++)
      (t[i] === null || lh(t[i])) && r.push(i);
    r.length && ph(t, r, n);
  }
  measureInitialState() {
    const { element: t, unresolvedKeyframes: n, name: r } = this;
    if (!t || !t.current)
      return;
    r === "height" && (this.suspendedScrollY = window.pageYOffset), this.measuredOrigin = Bt[r](t.measureViewportBox(), window.getComputedStyle(t.current)), n[0] = this.measuredOrigin;
    const i = n[n.length - 1];
    i !== void 0 && t.getValue(r, i).jump(i, !1);
  }
  measureEndState() {
    const { element: t, name: n, unresolvedKeyframes: r } = this;
    if (!t || !t.current)
      return;
    const i = t.getValue(n);
    i && i.jump(this.measuredOrigin, !1);
    const a = r.length - 1, o = r[a];
    r[a] = Bt[n](t.measureViewportBox(), window.getComputedStyle(t.current)), o !== null && this.finalKeyframe === void 0 && (this.finalKeyframe = o), this.removedTransforms?.length && this.removedTransforms.forEach(([l, c]) => {
      t.getValue(l).set(c);
    }), this.resolveNoneKeyframes();
  }
}
function gh(e, t, n) {
  if (e instanceof EventTarget)
    return [e];
  if (typeof e == "string") {
    let r = document;
    const i = n?.[e] ?? r.querySelectorAll(e);
    return i ? Array.from(i) : [];
  }
  return Array.from(e);
}
const Vl = (e, t) => t && typeof e == "number" ? t.transform(e) : e;
function Ll(e) {
  return Jo(e) && "offsetHeight" in e;
}
const Na = 30, bh = (e) => !isNaN(parseFloat(e));
class vh {
  /**
   * @param init - The initiating value
   * @param config - Optional configuration options
   *
   * -  `transformer`: A function to transform incoming values with.
   */
  constructor(t, n = {}) {
    this.canTrackVelocity = null, this.events = {}, this.updateAndNotify = (r) => {
      const i = et.now();
      if (this.updatedAt !== i && this.setPrevFrameValue(), this.prev = this.current, this.setCurrent(r), this.current !== this.prev && (this.events.change?.notify(this.current), this.dependents))
        for (const a of this.dependents)
          a.dirty();
    }, this.hasAnimated = !1, this.setCurrent(t), this.owner = n.owner;
  }
  setCurrent(t) {
    this.current = t, this.updatedAt = et.now(), this.canTrackVelocity === null && t !== void 0 && (this.canTrackVelocity = bh(this.current));
  }
  setPrevFrameValue(t = this.current) {
    this.prevFrameValue = t, this.prevUpdatedAt = this.updatedAt;
  }
  /**
   * Adds a function that will be notified when the `MotionValue` is updated.
   *
   * It returns a function that, when called, will cancel the subscription.
   *
   * When calling `onChange` inside a React component, it should be wrapped with the
   * `useEffect` hook. As it returns an unsubscribe function, this should be returned
   * from the `useEffect` function to ensure you don't add duplicate subscribers..
   *
   * ```jsx
   * export const MyComponent = () => {
   *   const x = useMotionValue(0)
   *   const y = useMotionValue(0)
   *   const opacity = useMotionValue(1)
   *
   *   useEffect(() => {
   *     function updateOpacity() {
   *       const maxXY = Math.max(x.get(), y.get())
   *       const newOpacity = transform(maxXY, [0, 100], [1, 0])
   *       opacity.set(newOpacity)
   *     }
   *
   *     const unsubscribeX = x.on("change", updateOpacity)
   *     const unsubscribeY = y.on("change", updateOpacity)
   *
   *     return () => {
   *       unsubscribeX()
   *       unsubscribeY()
   *     }
   *   }, [])
   *
   *   return <motion.div style={{ x }} />
   * }
   * ```
   *
   * @param subscriber - A function that receives the latest value.
   * @returns A function that, when called, will cancel this subscription.
   *
   * @deprecated
   */
  onChange(t) {
    return process.env.NODE_ENV !== "production" && bi(!1, 'value.onChange(callback) is deprecated. Switch to value.on("change", callback).'), this.on("change", t);
  }
  on(t, n) {
    this.events[t] || (this.events[t] = new gi());
    const r = this.events[t].add(n);
    return t === "change" ? () => {
      r(), ye.read(() => {
        this.events.change.getSize() || this.stop();
      });
    } : r;
  }
  clearListeners() {
    for (const t in this.events)
      this.events[t].clear();
  }
  /**
   * Attaches a passive effect to the `MotionValue`.
   */
  attach(t, n) {
    this.passiveEffect = t, this.stopPassiveEffect = n;
  }
  /**
   * Sets the state of the `MotionValue`.
   *
   * @remarks
   *
   * ```jsx
   * const x = useMotionValue(0)
   * x.set(10)
   * ```
   *
   * @param latest - Latest value to set.
   * @param render - Whether to notify render subscribers. Defaults to `true`
   *
   * @public
   */
  set(t) {
    this.passiveEffect ? this.passiveEffect(t, this.updateAndNotify) : this.updateAndNotify(t);
  }
  setWithVelocity(t, n, r) {
    this.set(n), this.prev = void 0, this.prevFrameValue = t, this.prevUpdatedAt = this.updatedAt - r;
  }
  /**
   * Set the state of the `MotionValue`, stopping any active animations,
   * effects, and resets velocity to `0`.
   */
  jump(t, n = !0) {
    this.updateAndNotify(t), this.prev = t, this.prevUpdatedAt = this.prevFrameValue = void 0, n && this.stop(), this.stopPassiveEffect && this.stopPassiveEffect();
  }
  dirty() {
    this.events.change?.notify(this.current);
  }
  addDependent(t) {
    this.dependents || (this.dependents = /* @__PURE__ */ new Set()), this.dependents.add(t);
  }
  removeDependent(t) {
    this.dependents && this.dependents.delete(t);
  }
  /**
   * Returns the latest state of `MotionValue`
   *
   * @returns - The latest state of `MotionValue`
   *
   * @public
   */
  get() {
    return this.current;
  }
  /**
   * @public
   */
  getPrevious() {
    return this.prev;
  }
  /**
   * Returns the latest velocity of `MotionValue`
   *
   * @returns - The latest velocity of `MotionValue`. Returns `0` if the state is non-numerical.
   *
   * @public
   */
  getVelocity() {
    const t = et.now();
    if (!this.canTrackVelocity || this.prevFrameValue === void 0 || t - this.updatedAt > Na)
      return 0;
    const n = Math.min(this.updatedAt - this.prevUpdatedAt, Na);
    return tl(parseFloat(this.current) - parseFloat(this.prevFrameValue), n);
  }
  /**
   * Registers a new animation to control this `MotionValue`. Only one
   * animation can drive a `MotionValue` at one time.
   *
   * ```jsx
   * value.start()
   * ```
   *
   * @param animation - A function that starts the provided animation
   */
  start(t) {
    return this.stop(), new Promise((n) => {
      this.hasAnimated = !0, this.animation = t(n), this.events.animationStart && this.events.animationStart.notify();
    }).then(() => {
      this.events.animationComplete && this.events.animationComplete.notify(), this.clearAnimation();
    });
  }
  /**
   * Stop the currently active animation.
   *
   * @public
   */
  stop() {
    this.animation && (this.animation.stop(), this.events.animationCancel && this.events.animationCancel.notify()), this.clearAnimation();
  }
  /**
   * Returns `true` if this value is currently animating.
   *
   * @public
   */
  isAnimating() {
    return !!this.animation;
  }
  clearAnimation() {
    delete this.animation;
  }
  /**
   * Destroy and clean up subscribers to this `MotionValue`.
   *
   * The `MotionValue` hooks like `useMotionValue` and `useTransform` automatically
   * handle the lifecycle of the returned `MotionValue`, so this method is only necessary if you've manually
   * created a `MotionValue` via the `motionValue` function.
   *
   * @public
   */
  destroy() {
    this.dependents?.clear(), this.events.destroy?.notify(), this.clearListeners(), this.stop(), this.stopPassiveEffect && this.stopPassiveEffect();
  }
}
function ls(e, t) {
  return new vh(e, t);
}
const { schedule: Ii } = /* @__PURE__ */ ml(queueMicrotask, !1), dt = {
  x: !1,
  y: !1
};
function Fl() {
  return dt.x || dt.y;
}
function yh(e) {
  return e === "x" || e === "y" ? dt[e] ? null : (dt[e] = !0, () => {
    dt[e] = !1;
  }) : dt.x || dt.y ? null : (dt.x = dt.y = !0, () => {
    dt.x = dt.y = !1;
  });
}
function zl(e, t) {
  const n = gh(e), r = new AbortController(), i = {
    passive: !0,
    ...t,
    signal: r.signal
  };
  return [n, i, () => r.abort()];
}
function Ca(e) {
  return !(e.pointerType === "touch" || Fl());
}
function jh(e, t, n = {}) {
  const [r, i, a] = zl(e, n), o = (l) => {
    if (!Ca(l))
      return;
    const { target: c } = l, u = t(c, l);
    if (typeof u != "function" || !c)
      return;
    const d = (m) => {
      Ca(m) && (u(m), c.removeEventListener("pointerleave", d));
    };
    c.addEventListener("pointerleave", d, i);
  };
  return r.forEach((l) => {
    l.addEventListener("pointerenter", o, i);
  }), a;
}
const _l = (e, t) => t ? e === t ? !0 : _l(e, t.parentElement) : !1, Di = (e) => e.pointerType === "mouse" ? typeof e.button != "number" || e.button <= 0 : e.isPrimary !== !1, wh = /* @__PURE__ */ new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "A"
]);
function Nh(e) {
  return wh.has(e.tagName) || e.tabIndex !== -1;
}
const kn = /* @__PURE__ */ new WeakSet();
function Sa(e) {
  return (t) => {
    t.key === "Enter" && e(t);
  };
}
function or(e, t) {
  e.dispatchEvent(new PointerEvent("pointer" + t, { isPrimary: !0, bubbles: !0 }));
}
const Ch = (e, t) => {
  const n = e.currentTarget;
  if (!n)
    return;
  const r = Sa(() => {
    if (kn.has(n))
      return;
    or(n, "down");
    const i = Sa(() => {
      or(n, "up");
    }), a = () => or(n, "cancel");
    n.addEventListener("keyup", i, t), n.addEventListener("blur", a, t);
  });
  n.addEventListener("keydown", r, t), n.addEventListener("blur", () => n.removeEventListener("keydown", r), t);
};
function ka(e) {
  return Di(e) && !Fl();
}
function Sh(e, t, n = {}) {
  const [r, i, a] = zl(e, n), o = (l) => {
    const c = l.currentTarget;
    if (!ka(l))
      return;
    kn.add(c);
    const u = t(c, l), d = (f, v) => {
      window.removeEventListener("pointerup", m), window.removeEventListener("pointercancel", h), kn.has(c) && kn.delete(c), ka(f) && typeof u == "function" && u(f, { success: v });
    }, m = (f) => {
      d(f, c === window || c === document || n.useGlobalTarget || _l(c, f.target));
    }, h = (f) => {
      d(f, !1);
    };
    window.addEventListener("pointerup", m, i), window.addEventListener("pointercancel", h, i);
  };
  return r.forEach((l) => {
    (n.useGlobalTarget ? window : l).addEventListener("pointerdown", o, i), Ll(l) && (l.addEventListener("focus", (u) => Ch(u, i)), !Nh(l) && !l.hasAttribute("tabindex") && (l.tabIndex = 0));
  }), a;
}
function $l(e) {
  return Jo(e) && "ownerSVGElement" in e;
}
function kh(e) {
  return $l(e) && e.tagName === "svg";
}
const Ue = (e) => !!(e && e.getVelocity), Th = [...Il, Ie, Mt], Ph = (e) => Th.find(Ml(e)), Oi = us({
  transformPagePoint: (e) => e,
  isStatic: !1,
  reducedMotion: "never"
});
class Eh extends p.Component {
  getSnapshotBeforeUpdate(t) {
    const n = this.props.childRef.current;
    if (n && t.isPresent && !this.props.isPresent) {
      const r = n.offsetParent, i = Ll(r) && r.offsetWidth || 0, a = this.props.sizeRef.current;
      a.height = n.offsetHeight || 0, a.width = n.offsetWidth || 0, a.top = n.offsetTop, a.left = n.offsetLeft, a.right = i - a.width - a.left;
    }
    return null;
  }
  /**
   * Required with getSnapshotBeforeUpdate to stop React complaining.
   */
  componentDidUpdate() {
  }
  render() {
    return this.props.children;
  }
}
function Ah({ children: e, isPresent: t, anchorX: n, root: r }) {
  const i = ci(), a = at(null), o = at({
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0
  }), { nonce: l } = We(Oi);
  return Yo(() => {
    const { width: c, height: u, top: d, left: m, right: h } = o.current;
    if (t || !a.current || !c || !u)
      return;
    const f = n === "left" ? `left: ${m}` : `right: ${h}`;
    a.current.dataset.motionPopId = i;
    const v = document.createElement("style");
    l && (v.nonce = l);
    const g = r ?? document.head;
    return g.appendChild(v), v.sheet && v.sheet.insertRule(`
          [data-motion-pop-id="${i}"] {
            position: absolute !important;
            width: ${c}px !important;
            height: ${u}px !important;
            ${f}px !important;
            top: ${d}px !important;
          }
        `), () => {
      g.contains(v) && g.removeChild(v);
    };
  }, [t]), s.jsx(Eh, { isPresent: t, childRef: a, sizeRef: o, children: p.cloneElement(e, { ref: a }) });
}
const Rh = ({ children: e, initial: t, isPresent: n, onExitComplete: r, custom: i, presenceAffectsLayout: a, mode: o, anchorX: l, root: c }) => {
  const u = mi(Mh), d = ci();
  let m = !0, h = ke(() => (m = !1, {
    id: d,
    initial: t,
    isPresent: n,
    custom: i,
    onExitComplete: (f) => {
      u.set(f, !0);
      for (const v of u.values())
        if (!v)
          return;
      r && r();
    },
    register: (f) => (u.set(f, !1), () => u.delete(f))
  }), [n, u, r]);
  return a && m && (h = { ...h }), ke(() => {
    u.forEach((f, v) => u.set(v, !1));
  }, [n]), p.useEffect(() => {
    !n && !u.size && r && r();
  }, [n]), o === "popLayout" && (e = s.jsx(Ah, { isPresent: n, anchorX: l, root: c, children: e })), s.jsx(Bn.Provider, { value: h, children: e });
};
function Mh() {
  return /* @__PURE__ */ new Map();
}
function Bl(e = !0) {
  const t = We(Bn);
  if (t === null)
    return [!0, null];
  const { isPresent: n, onExitComplete: r, register: i } = t, a = ci();
  li(() => {
    if (e)
      return i(a);
  }, [e]);
  const o = qo(() => e && r && r(a), [a, r, e]);
  return !n && r ? [!1, o] : [!0];
}
const on = (e) => e.key || "";
function Ta(e) {
  const t = [];
  return Su.forEach(e, (n) => {
    ku(n) && t.push(n);
  }), t;
}
const mt = ({ children: e, custom: t, initial: n = !0, onExitComplete: r, presenceAffectsLayout: i = !0, mode: a = "sync", propagate: o = !1, anchorX: l = "left", root: c }) => {
  const [u, d] = Bl(o), m = ke(() => Ta(e), [e]), h = o && !u ? [] : m.map(on), f = at(!0), v = at(m), g = mi(() => /* @__PURE__ */ new Map()), [N, j] = ve(m), [b, y] = ve(m);
  Zo(() => {
    f.current = !1, v.current = m;
    for (let E = 0; E < b.length; E++) {
      const A = on(b[E]);
      h.includes(A) ? g.delete(A) : g.get(A) !== !0 && g.set(A, !1);
    }
  }, [b, h.length, h.join("-")]);
  const S = [];
  if (m !== N) {
    let E = [...m];
    for (let A = 0; A < b.length; A++) {
      const k = b[A], L = on(k);
      h.includes(L) || (E.splice(A, 0, k), S.push(k));
    }
    return a === "wait" && S.length && (E = S), y(Ta(E)), j(m), null;
  }
  process.env.NODE_ENV !== "production" && a === "wait" && b.length > 1 && console.warn(`You're attempting to animate multiple children within AnimatePresence, but its mode is set to "wait". This will lead to odd visual behaviour.`);
  const { forceRender: T } = We(ui);
  return s.jsx(s.Fragment, { children: b.map((E) => {
    const A = on(E), k = o && !u ? !1 : m === b || h.includes(A), L = () => {
      if (g.has(A))
        g.set(A, !0);
      else
        return;
      let O = !0;
      g.forEach((q) => {
        q || (O = !1);
      }), O && (T?.(), y(v.current), o && d?.(), r && r());
    };
    return s.jsx(Rh, { isPresent: k, initial: !f.current || n ? void 0 : !1, custom: t, presenceAffectsLayout: i, mode: a, root: c, onExitComplete: k ? void 0 : L, anchorX: l, children: E }, A);
  }) });
}, Wl = us({ strict: !1 }), Pa = {
  animation: [
    "animate",
    "variants",
    "whileHover",
    "whileTap",
    "exit",
    "whileInView",
    "whileFocus",
    "whileDrag"
  ],
  exit: ["exit"],
  drag: ["drag", "dragControls"],
  focus: ["whileFocus"],
  hover: ["whileHover", "onHoverStart", "onHoverEnd"],
  tap: ["whileTap", "onTap", "onTapStart", "onTapCancel"],
  pan: ["onPan", "onPanStart", "onPanSessionStart", "onPanEnd"],
  inView: ["whileInView", "onViewportEnter", "onViewportLeave"],
  layout: ["layout", "layoutId"]
}, cs = {};
for (const e in Pa)
  cs[e] = {
    isEnabled: (t) => Pa[e].some((n) => !!t[n])
  };
function Ih(e) {
  for (const t in e)
    cs[t] = {
      ...cs[t],
      ...e[t]
    };
}
const Dh = /* @__PURE__ */ new Set([
  "animate",
  "exit",
  "variants",
  "initial",
  "style",
  "values",
  "variants",
  "transition",
  "transformTemplate",
  "custom",
  "inherit",
  "onBeforeLayoutMeasure",
  "onAnimationStart",
  "onAnimationComplete",
  "onUpdate",
  "onDragStart",
  "onDrag",
  "onDragEnd",
  "onMeasureDragConstraints",
  "onDirectionLock",
  "onDragTransitionEnd",
  "_dragX",
  "_dragY",
  "onHoverStart",
  "onHoverEnd",
  "onViewportEnter",
  "onViewportLeave",
  "globalTapTarget",
  "ignoreStrict",
  "viewport"
]);
function On(e) {
  return e.startsWith("while") || e.startsWith("drag") && e !== "draggable" || e.startsWith("layout") || e.startsWith("onTap") || e.startsWith("onPan") || e.startsWith("onLayout") || Dh.has(e);
}
let Ul = (e) => !On(e);
function Oh(e) {
  typeof e == "function" && (Ul = (t) => t.startsWith("on") ? !On(t) : e(t));
}
try {
  Oh(require("@emotion/is-prop-valid").default);
} catch {
}
function Vh(e, t, n) {
  const r = {};
  for (const i in e)
    i === "values" && typeof e.values == "object" || (Ul(i) || n === !0 && On(i) || !t && !On(i) || // If trying to use native HTML drag events, forward drag listeners
    e.draggable && i.startsWith("onDrag")) && (r[i] = e[i]);
  return r;
}
const Wn = /* @__PURE__ */ us({});
function Un(e) {
  return e !== null && typeof e == "object" && typeof e.start == "function";
}
function _s(e) {
  return typeof e == "string" || Array.isArray(e);
}
const Vi = [
  "animate",
  "whileInView",
  "whileFocus",
  "whileHover",
  "whileTap",
  "whileDrag",
  "exit"
], Li = ["initial", ...Vi];
function Hn(e) {
  return Un(e.animate) || Li.some((t) => _s(e[t]));
}
function Hl(e) {
  return !!(Hn(e) || e.variants);
}
function Lh(e, t) {
  if (Hn(e)) {
    const { initial: n, animate: r } = e;
    return {
      initial: n === !1 || _s(n) ? n : void 0,
      animate: _s(r) ? r : void 0
    };
  }
  return e.inherit !== !1 ? t : {};
}
function Fh(e) {
  const { initial: t, animate: n } = Lh(e, We(Wn));
  return ke(() => ({ initial: t, animate: n }), [Ea(t), Ea(n)]);
}
function Ea(e) {
  return Array.isArray(e) ? e.join(" ") : e;
}
const $s = {};
function zh(e) {
  for (const t in e)
    $s[t] = e[t], ji(t) && ($s[t].isCSSVariable = !0);
}
function Gl(e, { layout: t, layoutId: n }) {
  return ps.has(e) || e.startsWith("origin") || (t || n !== void 0) && (!!$s[e] || e === "opacity");
}
const _h = {
  x: "translateX",
  y: "translateY",
  z: "translateZ",
  transformPerspective: "perspective"
}, $h = fs.length;
function Bh(e, t, n) {
  let r = "", i = !0;
  for (let a = 0; a < $h; a++) {
    const o = fs[a], l = e[o];
    if (l === void 0)
      continue;
    let c = !0;
    if (typeof l == "number" ? c = l === (o.startsWith("scale") ? 1 : 0) : c = parseFloat(l) === 0, !c || n) {
      const u = Vl(l, Mi[o]);
      if (!c) {
        i = !1;
        const d = _h[o] || o;
        r += `${d}(${u}) `;
      }
      n && (t[o] = u);
    }
  }
  return r = r.trim(), n ? r = n(t, i ? "" : r) : i && (r = "none"), r;
}
function Fi(e, t, n) {
  const { style: r, vars: i, transformOrigin: a } = e;
  let o = !1, l = !1;
  for (const c in t) {
    const u = t[c];
    if (ps.has(c)) {
      o = !0;
      continue;
    } else if (ji(c)) {
      i[c] = u;
      continue;
    } else {
      const d = Vl(u, Mi[c]);
      c.startsWith("origin") ? (l = !0, a[c] = d) : r[c] = d;
    }
  }
  if (t.transform || (o || n ? r.transform = Bh(t, e.transform, n) : r.transform && (r.transform = "none")), l) {
    const { originX: c = "50%", originY: u = "50%", originZ: d = 0 } = a;
    r.transformOrigin = `${c} ${u} ${d}`;
  }
}
const zi = () => ({
  style: {},
  transform: {},
  transformOrigin: {},
  vars: {}
});
function Kl(e, t, n) {
  for (const r in t)
    !Ue(t[r]) && !Gl(r, n) && (e[r] = t[r]);
}
function Wh({ transformTemplate: e }, t) {
  return ke(() => {
    const n = zi();
    return Fi(n, t, e), Object.assign({}, n.vars, n.style);
  }, [t]);
}
function Uh(e, t) {
  const n = e.style || {}, r = {};
  return Kl(r, n, e), Object.assign(r, Wh(e, t)), r;
}
function Hh(e, t) {
  const n = {}, r = Uh(e, t);
  return e.drag && e.dragListener !== !1 && (n.draggable = !1, r.userSelect = r.WebkitUserSelect = r.WebkitTouchCallout = "none", r.touchAction = e.drag === !0 ? "none" : `pan-${e.drag === "x" ? "y" : "x"}`), e.tabIndex === void 0 && (e.onTap || e.onTapStart || e.whileTap) && (n.tabIndex = 0), n.style = r, n;
}
const Gh = {
  offset: "stroke-dashoffset",
  array: "stroke-dasharray"
}, Kh = {
  offset: "strokeDashoffset",
  array: "strokeDasharray"
};
function Yh(e, t, n = 1, r = 0, i = !0) {
  e.pathLength = 1;
  const a = i ? Gh : Kh;
  e[a.offset] = U.transform(-r);
  const o = U.transform(t), l = U.transform(n);
  e[a.array] = `${o} ${l}`;
}
function Yl(e, {
  attrX: t,
  attrY: n,
  attrScale: r,
  pathLength: i,
  pathSpacing: a = 1,
  pathOffset: o = 0,
  // This is object creation, which we try to avoid per-frame.
  ...l
}, c, u, d) {
  if (Fi(e, l, u), c) {
    e.style.viewBox && (e.attrs.viewBox = e.style.viewBox);
    return;
  }
  e.attrs = e.style, e.style = {};
  const { attrs: m, style: h } = e;
  m.transform && (h.transform = m.transform, delete m.transform), (h.transform || m.transformOrigin) && (h.transformOrigin = m.transformOrigin ?? "50% 50%", delete m.transformOrigin), h.transform && (h.transformBox = d?.transformBox ?? "fill-box", delete m.transformBox), t !== void 0 && (m.x = t), n !== void 0 && (m.y = n), r !== void 0 && (m.scale = r), i !== void 0 && Yh(m, i, a, o, !1);
}
const ql = () => ({
  ...zi(),
  attrs: {}
}), Xl = (e) => typeof e == "string" && e.toLowerCase() === "svg";
function qh(e, t, n, r) {
  const i = ke(() => {
    const a = ql();
    return Yl(a, t, Xl(r), e.transformTemplate, e.style), {
      ...a.attrs,
      style: { ...a.style }
    };
  }, [t]);
  if (e.style) {
    const a = {};
    Kl(a, e.style, e), i.style = { ...a, ...i.style };
  }
  return i;
}
const Xh = [
  "animate",
  "circle",
  "defs",
  "desc",
  "ellipse",
  "g",
  "image",
  "line",
  "filter",
  "marker",
  "mask",
  "metadata",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "rect",
  "stop",
  "switch",
  "symbol",
  "svg",
  "text",
  "tspan",
  "use",
  "view"
];
function _i(e) {
  return (
    /**
     * If it's not a string, it's a custom React component. Currently we only support
     * HTML custom React components.
     */
    typeof e != "string" || /**
     * If it contains a dash, the element is a custom HTML webcomponent.
     */
    e.includes("-") ? !1 : (
      /**
       * If it's in our list of lowercase SVG tags, it's an SVG component
       */
      !!(Xh.indexOf(e) > -1 || /**
       * If it contains a capital letter, it's an SVG component
       */
      /[A-Z]/u.test(e))
    )
  );
}
function Zh(e, t, n, { latestValues: r }, i, a = !1) {
  const l = (_i(e) ? qh : Hh)(t, r, i, e), c = Vh(t, typeof e == "string", a), u = e !== Xo ? { ...c, ...l, ref: n } : {}, { children: d } = t, m = ke(() => Ue(d) ? d.get() : d, [d]);
  return Rn(e, {
    ...u,
    children: m
  });
}
function Aa(e) {
  const t = [{}, {}];
  return e?.values.forEach((n, r) => {
    t[0][r] = n.get(), t[1][r] = n.getVelocity();
  }), t;
}
function $i(e, t, n, r) {
  if (typeof t == "function") {
    const [i, a] = Aa(r);
    t = t(n !== void 0 ? n : e.custom, i, a);
  }
  if (typeof t == "string" && (t = e.variants && e.variants[t]), typeof t == "function") {
    const [i, a] = Aa(r);
    t = t(n !== void 0 ? n : e.custom, i, a);
  }
  return t;
}
function Tn(e) {
  return Ue(e) ? e.get() : e;
}
function Qh({ scrapeMotionValuesFromProps: e, createRenderState: t }, n, r, i) {
  return {
    latestValues: Jh(n, r, i, e),
    renderState: t()
  };
}
function Jh(e, t, n, r) {
  const i = {}, a = r(e, {});
  for (const h in a)
    i[h] = Tn(a[h]);
  let { initial: o, animate: l } = e;
  const c = Hn(e), u = Hl(e);
  t && u && !c && e.inherit !== !1 && (o === void 0 && (o = t.initial), l === void 0 && (l = t.animate));
  let d = n ? n.initial === !1 : !1;
  d = d || o === !1;
  const m = d ? l : o;
  if (m && typeof m != "boolean" && !Un(m)) {
    const h = Array.isArray(m) ? m : [m];
    for (let f = 0; f < h.length; f++) {
      const v = $i(e, h[f]);
      if (v) {
        const { transitionEnd: g, transition: N, ...j } = v;
        for (const b in j) {
          let y = j[b];
          if (Array.isArray(y)) {
            const S = d ? y.length - 1 : 0;
            y = y[S];
          }
          y !== null && (i[b] = y);
        }
        for (const b in g)
          i[b] = g[b];
      }
    }
  }
  return i;
}
const Zl = (e) => (t, n) => {
  const r = We(Wn), i = We(Bn), a = () => Qh(e, t, r, i);
  return n ? a() : mi(a);
};
function Bi(e, t, n) {
  const { style: r } = e, i = {};
  for (const a in r)
    (Ue(r[a]) || t.style && Ue(t.style[a]) || Gl(a, e) || n?.getValue(a)?.liveStyle !== void 0) && (i[a] = r[a]);
  return i;
}
const ef = /* @__PURE__ */ Zl({
  scrapeMotionValuesFromProps: Bi,
  createRenderState: zi
});
function Ql(e, t, n) {
  const r = Bi(e, t, n);
  for (const i in e)
    if (Ue(e[i]) || Ue(t[i])) {
      const a = fs.indexOf(i) !== -1 ? "attr" + i.charAt(0).toUpperCase() + i.substring(1) : i;
      r[a] = e[i];
    }
  return r;
}
const tf = /* @__PURE__ */ Zl({
  scrapeMotionValuesFromProps: Ql,
  createRenderState: ql
}), sf = Symbol.for("motionComponentSymbol");
function ss(e) {
  return e && typeof e == "object" && Object.prototype.hasOwnProperty.call(e, "current");
}
function nf(e, t, n) {
  return qo(
    (r) => {
      r && e.onMount && e.onMount(r), t && (r ? t.mount(r) : t.unmount()), n && (typeof n == "function" ? n(r) : ss(n) && (n.current = r));
    },
    /**
     * Include externalRef in dependencies to ensure the callback updates
     * when the ref changes, allowing proper ref forwarding.
     */
    [t]
  );
}
const Wi = (e) => e.replace(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase(), rf = "framerAppearId", Jl = "data-" + Wi(rf), ec = us({});
function af(e, t, n, r, i) {
  const { visualElement: a } = We(Wn), o = We(Wl), l = We(Bn), c = We(Oi).reducedMotion, u = at(null);
  r = r || o.renderer, !u.current && r && (u.current = r(e, {
    visualState: t,
    parent: a,
    props: n,
    presenceContext: l,
    blockInitialAnimation: l ? l.initial === !1 : !1,
    reducedMotionConfig: c
  }));
  const d = u.current, m = We(ec);
  d && !d.projection && i && (d.type === "html" || d.type === "svg") && of(u.current, n, i, m);
  const h = at(!1);
  Yo(() => {
    d && h.current && d.update(n, l);
  });
  const f = n[Jl], v = at(!!f && !window.MotionHandoffIsComplete?.(f) && window.MotionHasOptimisedAnimation?.(f));
  return Zo(() => {
    d && (h.current = !0, window.MotionIsMounted = !0, d.updateFeatures(), d.scheduleRenderMicrotask(), v.current && d.animationState && d.animationState.animateChanges());
  }), li(() => {
    d && (!v.current && d.animationState && d.animationState.animateChanges(), v.current && (queueMicrotask(() => {
      window.MotionHandoffMarkAsComplete?.(f);
    }), v.current = !1), d.enteringChildren = void 0);
  }), d;
}
function of(e, t, n, r) {
  const { layoutId: i, layout: a, drag: o, dragConstraints: l, layoutScroll: c, layoutRoot: u, layoutCrossfade: d } = t;
  e.projection = new n(e.latestValues, t["data-framer-portal-id"] ? void 0 : tc(e.parent)), e.projection.setOptions({
    layoutId: i,
    layout: a,
    alwaysMeasureLayout: !!o || l && ss(l),
    visualElement: e,
    /**
     * TODO: Update options in an effect. This could be tricky as it'll be too late
     * to update by the time layout animations run.
     * We also need to fix this safeToRemove by linking it up to the one returned by usePresence,
     * ensuring it gets called if there's no potential layout animations.
     *
     */
    animationType: typeof a == "string" ? a : "both",
    initialPromotionConfig: r,
    crossfade: d,
    layoutScroll: c,
    layoutRoot: u
  });
}
function tc(e) {
  if (e)
    return e.options.allowProjection !== !1 ? e.projection : tc(e.parent);
}
function lr(e, { forwardMotionProps: t = !1 } = {}, n, r) {
  n && Ih(n);
  const i = _i(e) ? tf : ef;
  function a(l, c) {
    let u;
    const d = {
      ...We(Oi),
      ...l,
      layoutId: lf(l)
    }, { isStatic: m } = d, h = Fh(l), f = i(l, m);
    if (!m && hi) {
      cf(d, n);
      const v = df(d);
      u = v.MeasureLayout, h.visualElement = af(e, f, d, r, v.ProjectionNode);
    }
    return s.jsxs(Wn.Provider, { value: h, children: [u && h.visualElement ? s.jsx(u, { visualElement: h.visualElement, ...d }) : null, Zh(e, l, nf(f, h.visualElement, c), f, m, t)] });
  }
  a.displayName = `motion.${typeof e == "string" ? e : `create(${e.displayName ?? e.name ?? ""})`}`;
  const o = di(a);
  return o[sf] = e, o;
}
function lf({ layoutId: e }) {
  const t = We(ui).id;
  return t && e !== void 0 ? t + "-" + e : e;
}
function cf(e, t) {
  const n = We(Wl).strict;
  if (process.env.NODE_ENV !== "production" && t && n) {
    const r = "You have rendered a `motion` component within a `LazyMotion` component. This will break tree shaking. Import and render a `m` component instead.";
    e.ignoreStrict ? ms(!1, r, "lazy-strict-mode") : Ct(!1, r, "lazy-strict-mode");
  }
}
function df(e) {
  const { drag: t, layout: n } = cs;
  if (!t && !n)
    return {};
  const r = { ...t, ...n };
  return {
    MeasureLayout: t?.isEnabled(e) || n?.isEnabled(e) ? r.MeasureLayout : void 0,
    ProjectionNode: r.ProjectionNode
  };
}
function uf(e, t) {
  if (typeof Proxy > "u")
    return lr;
  const n = /* @__PURE__ */ new Map(), r = (a, o) => lr(a, o, e, t), i = (a, o) => (process.env.NODE_ENV !== "production" && bi(!1, "motion() is deprecated. Use motion.create() instead."), r(a, o));
  return new Proxy(i, {
    /**
     * Called when `motion` is referenced with a prop: `motion.div`, `motion.input` etc.
     * The prop name is passed through as `key` and we can use that to generate a `motion`
     * DOM component with that name.
     */
    get: (a, o) => o === "create" ? r : (n.has(o) || n.set(o, lr(o, void 0, e, t)), n.get(o))
  });
}
function sc({ top: e, left: t, right: n, bottom: r }) {
  return {
    x: { min: t, max: n },
    y: { min: e, max: r }
  };
}
function mf({ x: e, y: t }) {
  return { top: t.min, right: e.max, bottom: t.max, left: e.min };
}
function hf(e, t) {
  if (!t)
    return e;
  const n = t({ x: e.left, y: e.top }), r = t({ x: e.right, y: e.bottom });
  return {
    top: n.y,
    left: n.x,
    bottom: r.y,
    right: r.x
  };
}
function cr(e) {
  return e === void 0 || e === 1;
}
function Hr({ scale: e, scaleX: t, scaleY: n }) {
  return !cr(e) || !cr(t) || !cr(n);
}
function zt(e) {
  return Hr(e) || nc(e) || e.z || e.rotate || e.rotateX || e.rotateY || e.skewX || e.skewY;
}
function nc(e) {
  return Ra(e.x) || Ra(e.y);
}
function Ra(e) {
  return e && e !== "0%";
}
function Vn(e, t, n) {
  const r = e - n, i = t * r;
  return n + i;
}
function Ma(e, t, n, r, i) {
  return i !== void 0 && (e = Vn(e, i, r)), Vn(e, n, r) + t;
}
function Gr(e, t = 0, n = 1, r, i) {
  e.min = Ma(e.min, t, n, r, i), e.max = Ma(e.max, t, n, r, i);
}
function rc(e, { x: t, y: n }) {
  Gr(e.x, t.translate, t.scale, t.originPoint), Gr(e.y, n.translate, n.scale, n.originPoint);
}
const Ia = 0.999999999999, Da = 1.0000000000001;
function ff(e, t, n, r = !1) {
  const i = n.length;
  if (!i)
    return;
  t.x = t.y = 1;
  let a, o;
  for (let l = 0; l < i; l++) {
    a = n[l], o = a.projectionDelta;
    const { visualElement: c } = a.options;
    c && c.props.style && c.props.style.display === "contents" || (r && a.options.layoutScroll && a.scroll && a !== a.root && rs(e, {
      x: -a.scroll.offset.x,
      y: -a.scroll.offset.y
    }), o && (t.x *= o.x.scale, t.y *= o.y.scale, rc(e, o)), r && zt(a.latestValues) && rs(e, a.latestValues));
  }
  t.x < Da && t.x > Ia && (t.x = 1), t.y < Da && t.y > Ia && (t.y = 1);
}
function ns(e, t) {
  e.min = e.min + t, e.max = e.max + t;
}
function Oa(e, t, n, r, i = 0.5) {
  const a = Ce(e.min, e.max, i);
  Gr(e, t, n, a, r);
}
function rs(e, t) {
  Oa(e.x, t.x, t.scaleX, t.scale, t.originX), Oa(e.y, t.y, t.scaleY, t.scale, t.originY);
}
function ic(e, t) {
  return sc(hf(e.getBoundingClientRect(), t));
}
function pf(e, t, n) {
  const r = ic(e, n), { scroll: i } = t;
  return i && (ns(r.x, i.offset.x), ns(r.y, i.offset.y)), r;
}
const Va = () => ({
  translate: 0,
  scale: 1,
  origin: 0,
  originPoint: 0
}), is = () => ({
  x: Va(),
  y: Va()
}), La = () => ({ min: 0, max: 0 }), Ee = () => ({
  x: La(),
  y: La()
}), Kr = { current: null }, ac = { current: !1 };
function xf() {
  if (ac.current = !0, !!hi)
    if (window.matchMedia) {
      const e = window.matchMedia("(prefers-reduced-motion)"), t = () => Kr.current = e.matches;
      e.addEventListener("change", t), t();
    } else
      Kr.current = !1;
}
const gf = /* @__PURE__ */ new WeakMap();
function bf(e, t, n) {
  for (const r in t) {
    const i = t[r], a = n[r];
    if (Ue(i))
      e.addValue(r, i);
    else if (Ue(a))
      e.addValue(r, ls(i, { owner: e }));
    else if (a !== i)
      if (e.hasValue(r)) {
        const o = e.getValue(r);
        o.liveStyle === !0 ? o.jump(i) : o.hasAnimated || o.set(i);
      } else {
        const o = e.getStaticValue(r);
        e.addValue(r, ls(o !== void 0 ? o : i, { owner: e }));
      }
  }
  for (const r in n)
    t[r] === void 0 && e.removeValue(r);
  return t;
}
const Fa = [
  "AnimationStart",
  "AnimationComplete",
  "Update",
  "BeforeLayoutMeasure",
  "LayoutMeasure",
  "LayoutAnimationStart",
  "LayoutAnimationComplete"
];
class vf {
  /**
   * This method takes React props and returns found MotionValues. For example, HTML
   * MotionValues will be found within the style prop, whereas for Three.js within attribute arrays.
   *
   * This isn't an abstract method as it needs calling in the constructor, but it is
   * intended to be one.
   */
  scrapeMotionValuesFromProps(t, n, r) {
    return {};
  }
  constructor({ parent: t, props: n, presenceContext: r, reducedMotionConfig: i, blockInitialAnimation: a, visualState: o }, l = {}) {
    this.current = null, this.children = /* @__PURE__ */ new Set(), this.isVariantNode = !1, this.isControllingVariants = !1, this.shouldReduceMotion = null, this.values = /* @__PURE__ */ new Map(), this.KeyframeResolver = Ai, this.features = {}, this.valueSubscriptions = /* @__PURE__ */ new Map(), this.prevMotionValues = {}, this.events = {}, this.propEventSubscriptions = {}, this.notifyUpdate = () => this.notify("Update", this.latestValues), this.render = () => {
      this.current && (this.triggerBuild(), this.renderInstance(this.current, this.renderState, this.props.style, this.projection));
    }, this.renderScheduledAt = 0, this.scheduleRender = () => {
      const h = et.now();
      this.renderScheduledAt < h && (this.renderScheduledAt = h, ye.render(this.render, !1, !0));
    };
    const { latestValues: c, renderState: u } = o;
    this.latestValues = c, this.baseTarget = { ...c }, this.initialValues = n.initial ? { ...c } : {}, this.renderState = u, this.parent = t, this.props = n, this.presenceContext = r, this.depth = t ? t.depth + 1 : 0, this.reducedMotionConfig = i, this.options = l, this.blockInitialAnimation = !!a, this.isControllingVariants = Hn(n), this.isVariantNode = Hl(n), this.isVariantNode && (this.variantChildren = /* @__PURE__ */ new Set()), this.manuallyAnimateOnMount = !!(t && t.current);
    const { willChange: d, ...m } = this.scrapeMotionValuesFromProps(n, {}, this);
    for (const h in m) {
      const f = m[h];
      c[h] !== void 0 && Ue(f) && f.set(c[h]);
    }
  }
  mount(t) {
    this.current = t, gf.set(t, this), this.projection && !this.projection.instance && this.projection.mount(t), this.parent && this.isVariantNode && !this.isControllingVariants && (this.removeFromVariantTree = this.parent.addVariantChild(this)), this.values.forEach((n, r) => this.bindToMotionValue(r, n)), ac.current || xf(), this.shouldReduceMotion = this.reducedMotionConfig === "never" ? !1 : this.reducedMotionConfig === "always" ? !0 : Kr.current, process.env.NODE_ENV !== "production" && bi(this.shouldReduceMotion !== !0, "You have Reduced Motion enabled on your device. Animations may not appear as expected.", "reduced-motion-disabled"), this.parent?.addChild(this), this.update(this.props, this.presenceContext);
  }
  unmount() {
    this.projection && this.projection.unmount(), Rt(this.notifyUpdate), Rt(this.render), this.valueSubscriptions.forEach((t) => t()), this.valueSubscriptions.clear(), this.removeFromVariantTree && this.removeFromVariantTree(), this.parent?.removeChild(this);
    for (const t in this.events)
      this.events[t].clear();
    for (const t in this.features) {
      const n = this.features[t];
      n && (n.unmount(), n.isMounted = !1);
    }
    this.current = null;
  }
  addChild(t) {
    this.children.add(t), this.enteringChildren ?? (this.enteringChildren = /* @__PURE__ */ new Set()), this.enteringChildren.add(t);
  }
  removeChild(t) {
    this.children.delete(t), this.enteringChildren && this.enteringChildren.delete(t);
  }
  bindToMotionValue(t, n) {
    this.valueSubscriptions.has(t) && this.valueSubscriptions.get(t)();
    const r = ps.has(t);
    r && this.onBindTransform && this.onBindTransform();
    const i = n.on("change", (o) => {
      this.latestValues[t] = o, this.props.onUpdate && ye.preRender(this.notifyUpdate), r && this.projection && (this.projection.isTransformDirty = !0), this.scheduleRender();
    });
    let a;
    window.MotionCheckAppearSync && (a = window.MotionCheckAppearSync(this, t, n)), this.valueSubscriptions.set(t, () => {
      i(), a && a(), n.owner && n.stop();
    });
  }
  sortNodePosition(t) {
    return !this.current || !this.sortInstanceNodePosition || this.type !== t.type ? 0 : this.sortInstanceNodePosition(this.current, t.current);
  }
  updateFeatures() {
    let t = "animation";
    for (t in cs) {
      const n = cs[t];
      if (!n)
        continue;
      const { isEnabled: r, Feature: i } = n;
      if (!this.features[t] && i && r(this.props) && (this.features[t] = new i(this)), this.features[t]) {
        const a = this.features[t];
        a.isMounted ? a.update() : (a.mount(), a.isMounted = !0);
      }
    }
  }
  triggerBuild() {
    this.build(this.renderState, this.latestValues, this.props);
  }
  /**
   * Measure the current viewport box with or without transforms.
   * Only measures axis-aligned boxes, rotate and skew must be manually
   * removed with a re-render to work.
   */
  measureViewportBox() {
    return this.current ? this.measureInstanceViewportBox(this.current, this.props) : Ee();
  }
  getStaticValue(t) {
    return this.latestValues[t];
  }
  setStaticValue(t, n) {
    this.latestValues[t] = n;
  }
  /**
   * Update the provided props. Ensure any newly-added motion values are
   * added to our map, old ones removed, and listeners updated.
   */
  update(t, n) {
    (t.transformTemplate || this.props.transformTemplate) && this.scheduleRender(), this.prevProps = this.props, this.props = t, this.prevPresenceContext = this.presenceContext, this.presenceContext = n;
    for (let r = 0; r < Fa.length; r++) {
      const i = Fa[r];
      this.propEventSubscriptions[i] && (this.propEventSubscriptions[i](), delete this.propEventSubscriptions[i]);
      const a = "on" + i, o = t[a];
      o && (this.propEventSubscriptions[i] = this.on(i, o));
    }
    this.prevMotionValues = bf(this, this.scrapeMotionValuesFromProps(t, this.prevProps, this), this.prevMotionValues), this.handleChildMotionValue && this.handleChildMotionValue();
  }
  getProps() {
    return this.props;
  }
  /**
   * Returns the variant definition with a given name.
   */
  getVariant(t) {
    return this.props.variants ? this.props.variants[t] : void 0;
  }
  /**
   * Returns the defined default transition on this component.
   */
  getDefaultTransition() {
    return this.props.transition;
  }
  getTransformPagePoint() {
    return this.props.transformPagePoint;
  }
  getClosestVariantNode() {
    return this.isVariantNode ? this : this.parent ? this.parent.getClosestVariantNode() : void 0;
  }
  /**
   * Add a child visual element to our set of children.
   */
  addVariantChild(t) {
    const n = this.getClosestVariantNode();
    if (n)
      return n.variantChildren && n.variantChildren.add(t), () => n.variantChildren.delete(t);
  }
  /**
   * Add a motion value and bind it to this visual element.
   */
  addValue(t, n) {
    const r = this.values.get(t);
    n !== r && (r && this.removeValue(t), this.bindToMotionValue(t, n), this.values.set(t, n), this.latestValues[t] = n.get());
  }
  /**
   * Remove a motion value and unbind any active subscriptions.
   */
  removeValue(t) {
    this.values.delete(t);
    const n = this.valueSubscriptions.get(t);
    n && (n(), this.valueSubscriptions.delete(t)), delete this.latestValues[t], this.removeValueFromRenderState(t, this.renderState);
  }
  /**
   * Check whether we have a motion value for this key
   */
  hasValue(t) {
    return this.values.has(t);
  }
  getValue(t, n) {
    if (this.props.values && this.props.values[t])
      return this.props.values[t];
    let r = this.values.get(t);
    return r === void 0 && n !== void 0 && (r = ls(n === null ? void 0 : n, { owner: this }), this.addValue(t, r)), r;
  }
  /**
   * If we're trying to animate to a previously unencountered value,
   * we need to check for it in our state and as a last resort read it
   * directly from the instance (which might have performance implications).
   */
  readValue(t, n) {
    let r = this.latestValues[t] !== void 0 || !this.current ? this.latestValues[t] : this.getBaseTargetFromProps(this.props, t) ?? this.readValueFromInstance(this.current, t, this.options);
    return r != null && (typeof r == "string" && (Qo(r) || el(r)) ? r = parseFloat(r) : !Ph(r) && Mt.test(n) && (r = Ol(t, n)), this.setBaseTarget(t, Ue(r) ? r.get() : r)), Ue(r) ? r.get() : r;
  }
  /**
   * Set the base target to later animate back to. This is currently
   * only hydrated on creation and when we first read a value.
   */
  setBaseTarget(t, n) {
    this.baseTarget[t] = n;
  }
  /**
   * Find the base target for a value thats been removed from all animation
   * props.
   */
  getBaseTarget(t) {
    const { initial: n } = this.props;
    let r;
    if (typeof n == "string" || typeof n == "object") {
      const a = $i(this.props, n, this.presenceContext?.custom);
      a && (r = a[t]);
    }
    if (n && r !== void 0)
      return r;
    const i = this.getBaseTargetFromProps(this.props, t);
    return i !== void 0 && !Ue(i) ? i : this.initialValues[t] !== void 0 && r === void 0 ? void 0 : this.baseTarget[t];
  }
  on(t, n) {
    return this.events[t] || (this.events[t] = new gi()), this.events[t].add(n);
  }
  notify(t, ...n) {
    this.events[t] && this.events[t].notify(...n);
  }
  scheduleRenderMicrotask() {
    Ii.render(this.render);
  }
}
class oc extends vf {
  constructor() {
    super(...arguments), this.KeyframeResolver = xh;
  }
  sortInstanceNodePosition(t, n) {
    return t.compareDocumentPosition(n) & 2 ? 1 : -1;
  }
  getBaseTargetFromProps(t, n) {
    return t.style ? t.style[n] : void 0;
  }
  removeValueFromRenderState(t, { vars: n, style: r }) {
    delete n[t], delete r[t];
  }
  handleChildMotionValue() {
    this.childSubscription && (this.childSubscription(), delete this.childSubscription);
    const { children: t } = this.props;
    Ue(t) && (this.childSubscription = t.on("change", (n) => {
      this.current && (this.current.textContent = `${n}`);
    }));
  }
}
function lc(e, { style: t, vars: n }, r, i) {
  const a = e.style;
  let o;
  for (o in t)
    a[o] = t[o];
  i?.applyProjectionStyles(a, r);
  for (o in n)
    a.setProperty(o, n[o]);
}
function yf(e) {
  return window.getComputedStyle(e);
}
class jf extends oc {
  constructor() {
    super(...arguments), this.type = "html", this.renderInstance = lc;
  }
  readValueFromInstance(t, n) {
    if (ps.has(n))
      return this.projection?.isProjecting ? Fr(n) : Dm(t, n);
    {
      const r = yf(t), i = (ji(n) ? r.getPropertyValue(n) : r[n]) || 0;
      return typeof i == "string" ? i.trim() : i;
    }
  }
  measureInstanceViewportBox(t, { transformPagePoint: n }) {
    return ic(t, n);
  }
  build(t, n, r) {
    Fi(t, n, r.transformTemplate);
  }
  scrapeMotionValuesFromProps(t, n, r) {
    return Bi(t, n, r);
  }
}
const cc = /* @__PURE__ */ new Set([
  "baseFrequency",
  "diffuseConstant",
  "kernelMatrix",
  "kernelUnitLength",
  "keySplines",
  "keyTimes",
  "limitingConeAngle",
  "markerHeight",
  "markerWidth",
  "numOctaves",
  "targetX",
  "targetY",
  "surfaceScale",
  "specularConstant",
  "specularExponent",
  "stdDeviation",
  "tableValues",
  "viewBox",
  "gradientTransform",
  "pathLength",
  "startOffset",
  "textLength",
  "lengthAdjust"
]);
function wf(e, t, n, r) {
  lc(e, t, void 0, r);
  for (const i in t.attrs)
    e.setAttribute(cc.has(i) ? i : Wi(i), t.attrs[i]);
}
class Nf extends oc {
  constructor() {
    super(...arguments), this.type = "svg", this.isSVGTag = !1, this.measureInstanceViewportBox = Ee;
  }
  getBaseTargetFromProps(t, n) {
    return t[n];
  }
  readValueFromInstance(t, n) {
    if (ps.has(n)) {
      const r = Dl(n);
      return r && r.default || 0;
    }
    return n = cc.has(n) ? n : Wi(n), t.getAttribute(n);
  }
  scrapeMotionValuesFromProps(t, n, r) {
    return Ql(t, n, r);
  }
  build(t, n, r) {
    Yl(t, n, this.isSVGTag, r.transformTemplate, r.style);
  }
  renderInstance(t, n, r, i) {
    wf(t, n, r, i);
  }
  mount(t) {
    this.isSVGTag = Xl(t.tagName), super.mount(t);
  }
}
const Cf = (e, t) => _i(e) ? new Nf(t) : new jf(t, {
  allowProjection: e !== Xo
});
function as(e, t, n) {
  const r = e.getProps();
  return $i(r, t, n !== void 0 ? n : r.custom, e);
}
const Yr = (e) => Array.isArray(e);
function Sf(e, t, n) {
  e.hasValue(t) ? e.getValue(t).set(n) : e.addValue(t, ls(n));
}
function kf(e) {
  return Yr(e) ? e[e.length - 1] || 0 : e;
}
function Tf(e, t) {
  const n = as(e, t);
  let { transitionEnd: r = {}, transition: i = {}, ...a } = n || {};
  a = { ...a, ...r };
  for (const o in a) {
    const l = kf(a[o]);
    Sf(e, o, l);
  }
}
function Pf(e) {
  return !!(Ue(e) && e.add);
}
function qr(e, t) {
  const n = e.getValue("willChange");
  if (Pf(n))
    return n.add(t);
  if (!n && St.WillChange) {
    const r = new St.WillChange("auto");
    e.addValue("willChange", r), r.add(t);
  }
}
function dc(e) {
  return e.props[Jl];
}
const Ef = (e) => e !== null;
function Af(e, { repeat: t, repeatType: n = "loop" }, r) {
  const i = e.filter(Ef), a = t && n !== "loop" && t % 2 === 1 ? 0 : i.length - 1;
  return i[a];
}
const Rf = {
  type: "spring",
  stiffness: 500,
  damping: 25,
  restSpeed: 10
}, Mf = (e) => ({
  type: "spring",
  stiffness: 550,
  damping: e === 0 ? 2 * Math.sqrt(550) : 30,
  restSpeed: 10
}), If = {
  type: "keyframes",
  duration: 0.8
}, Df = {
  type: "keyframes",
  ease: [0.25, 0.1, 0.35, 1],
  duration: 0.3
}, Of = (e, { keyframes: t }) => t.length > 2 ? If : ps.has(e) ? e.startsWith("scale") ? Mf(t[1]) : Rf : Df;
function Vf({ when: e, delay: t, delayChildren: n, staggerChildren: r, staggerDirection: i, repeat: a, repeatType: o, repeatDelay: l, from: c, elapsed: u, ...d }) {
  return !!Object.keys(d).length;
}
const Ui = (e, t, n, r = {}, i, a) => (o) => {
  const l = Ri(r, e) || {}, c = l.delay || r.delay || 0;
  let { elapsed: u = 0 } = r;
  u = u - /* @__PURE__ */ ut(c);
  const d = {
    keyframes: Array.isArray(n) ? n : [null, n],
    ease: "easeOut",
    velocity: t.getVelocity(),
    ...l,
    delay: -u,
    onUpdate: (h) => {
      t.set(h), l.onUpdate && l.onUpdate(h);
    },
    onComplete: () => {
      o(), l.onComplete && l.onComplete();
    },
    name: e,
    motionValue: t,
    element: a ? void 0 : i
  };
  Vf(l) || Object.assign(d, Of(e, d)), d.duration && (d.duration = /* @__PURE__ */ ut(d.duration)), d.repeatDelay && (d.repeatDelay = /* @__PURE__ */ ut(d.repeatDelay)), d.from !== void 0 && (d.keyframes[0] = d.from);
  let m = !1;
  if ((d.type === !1 || d.duration === 0 && !d.repeatDelay) && (Wr(d), d.delay === 0 && (m = !0)), (St.instantAnimations || St.skipAnimations) && (m = !0, Wr(d), d.delay = 0), d.allowFlatten = !l.type && !l.ease, m && !a && t.get() !== void 0) {
    const h = Af(d.keyframes, l);
    if (h !== void 0) {
      ye.update(() => {
        d.onUpdate(h), d.onComplete();
      });
      return;
    }
  }
  return l.isSync ? new Ei(d) : new nh(d);
};
function Lf({ protectedKeys: e, needsAnimating: t }, n) {
  const r = e.hasOwnProperty(n) && t[n] !== !0;
  return t[n] = !1, r;
}
function uc(e, t, { delay: n = 0, transitionOverride: r, type: i } = {}) {
  let { transition: a = e.getDefaultTransition(), transitionEnd: o, ...l } = t;
  r && (a = r);
  const c = [], u = i && e.animationState && e.animationState.getState()[i];
  for (const d in l) {
    const m = e.getValue(d, e.latestValues[d] ?? null), h = l[d];
    if (h === void 0 || u && Lf(u, d))
      continue;
    const f = {
      delay: n,
      ...Ri(a || {}, d)
    }, v = m.get();
    if (v !== void 0 && !m.isAnimating && !Array.isArray(h) && h === v && !f.velocity)
      continue;
    let g = !1;
    if (window.MotionHandoffAnimation) {
      const j = dc(e);
      if (j) {
        const b = window.MotionHandoffAnimation(j, d, ye);
        b !== null && (f.startTime = b, g = !0);
      }
    }
    qr(e, d), m.start(Ui(d, m, h, e.shouldReduceMotion && Rl.has(d) ? { type: !1 } : f, e, g));
    const N = m.animation;
    N && c.push(N);
  }
  return o && Promise.all(c).then(() => {
    ye.update(() => {
      o && Tf(e, o);
    });
  }), c;
}
function mc(e, t, n, r = 0, i = 1) {
  const a = Array.from(e).sort((u, d) => u.sortNodePosition(d)).indexOf(t), o = e.size, l = (o - 1) * r;
  return typeof n == "function" ? n(a, o) : i === 1 ? a * r : l - a * r;
}
function Xr(e, t, n = {}) {
  const r = as(e, t, n.type === "exit" ? e.presenceContext?.custom : void 0);
  let { transition: i = e.getDefaultTransition() || {} } = r || {};
  n.transitionOverride && (i = n.transitionOverride);
  const a = r ? () => Promise.all(uc(e, r, n)) : () => Promise.resolve(), o = e.variantChildren && e.variantChildren.size ? (c = 0) => {
    const { delayChildren: u = 0, staggerChildren: d, staggerDirection: m } = i;
    return Ff(e, t, c, u, d, m, n);
  } : () => Promise.resolve(), { when: l } = i;
  if (l) {
    const [c, u] = l === "beforeChildren" ? [a, o] : [o, a];
    return c().then(() => u());
  } else
    return Promise.all([a(), o(n.delay)]);
}
function Ff(e, t, n = 0, r = 0, i = 0, a = 1, o) {
  const l = [];
  for (const c of e.variantChildren)
    c.notify("AnimationStart", t), l.push(Xr(c, t, {
      ...o,
      delay: n + (typeof r == "function" ? 0 : r) + mc(e.variantChildren, c, r, i, a)
    }).then(() => c.notify("AnimationComplete", t)));
  return Promise.all(l);
}
function zf(e, t, n = {}) {
  e.notify("AnimationStart", t);
  let r;
  if (Array.isArray(t)) {
    const i = t.map((a) => Xr(e, a, n));
    r = Promise.all(i);
  } else if (typeof t == "string")
    r = Xr(e, t, n);
  else {
    const i = typeof t == "function" ? as(e, t, n.custom) : t;
    r = Promise.all(uc(e, i, n));
  }
  return r.then(() => {
    e.notify("AnimationComplete", t);
  });
}
function hc(e, t) {
  if (!Array.isArray(t))
    return !1;
  const n = t.length;
  if (n !== e.length)
    return !1;
  for (let r = 0; r < n; r++)
    if (t[r] !== e[r])
      return !1;
  return !0;
}
const _f = Li.length;
function fc(e) {
  if (!e)
    return;
  if (!e.isControllingVariants) {
    const n = e.parent ? fc(e.parent) || {} : {};
    return e.props.initial !== void 0 && (n.initial = e.props.initial), n;
  }
  const t = {};
  for (let n = 0; n < _f; n++) {
    const r = Li[n], i = e.props[r];
    (_s(i) || i === !1) && (t[r] = i);
  }
  return t;
}
const $f = [...Vi].reverse(), Bf = Vi.length;
function Wf(e) {
  return (t) => Promise.all(t.map(({ animation: n, options: r }) => zf(e, n, r)));
}
function Uf(e) {
  let t = Wf(e), n = za(), r = !0;
  const i = (c) => (u, d) => {
    const m = as(e, d, c === "exit" ? e.presenceContext?.custom : void 0);
    if (m) {
      const { transition: h, transitionEnd: f, ...v } = m;
      u = { ...u, ...v, ...f };
    }
    return u;
  };
  function a(c) {
    t = c(e);
  }
  function o(c) {
    const { props: u } = e, d = fc(e.parent) || {}, m = [], h = /* @__PURE__ */ new Set();
    let f = {}, v = 1 / 0;
    for (let N = 0; N < Bf; N++) {
      const j = $f[N], b = n[j], y = u[j] !== void 0 ? u[j] : d[j], S = _s(y), T = j === c ? b.isActive : null;
      T === !1 && (v = N);
      let E = y === d[j] && y !== u[j] && S;
      if (E && r && e.manuallyAnimateOnMount && (E = !1), b.protectedKeys = { ...f }, // If it isn't active and hasn't *just* been set as inactive
      !b.isActive && T === null || // If we didn't and don't have any defined prop for this animation type
      !y && !b.prevProp || // Or if the prop doesn't define an animation
      Un(y) || typeof y == "boolean")
        continue;
      const A = Hf(b.prevProp, y);
      let k = A || // If we're making this variant active, we want to always make it active
      j === c && b.isActive && !E && S || // If we removed a higher-priority variant (i is in reverse order)
      N > v && S, L = !1;
      const O = Array.isArray(y) ? y : [y];
      let q = O.reduce(i(j), {});
      T === !1 && (q = {});
      const { prevResolvedValues: P = {} } = b, be = {
        ...P,
        ...q
      }, me = (re) => {
        k = !0, h.has(re) && (L = !0, h.delete(re)), b.needsAnimating[re] = !0;
        const w = e.getValue(re);
        w && (w.liveStyle = !1);
      };
      for (const re in be) {
        const w = q[re], B = P[re];
        if (f.hasOwnProperty(re))
          continue;
        let W = !1;
        Yr(w) && Yr(B) ? W = !hc(w, B) : W = w !== B, W ? w != null ? me(re) : h.add(re) : w !== void 0 && h.has(re) ? me(re) : b.protectedKeys[re] = !0;
      }
      b.prevProp = y, b.prevResolvedValues = q, b.isActive && (f = { ...f, ...q }), r && e.blockInitialAnimation && (k = !1);
      const pe = E && A;
      k && (!pe || L) && m.push(...O.map((re) => {
        const w = { type: j };
        if (typeof re == "string" && r && !pe && e.manuallyAnimateOnMount && e.parent) {
          const { parent: B } = e, W = as(B, re);
          if (B.enteringChildren && W) {
            const { delayChildren: G } = W.transition || {};
            w.delay = mc(B.enteringChildren, e, G);
          }
        }
        return {
          animation: re,
          options: w
        };
      }));
    }
    if (h.size) {
      const N = {};
      if (typeof u.initial != "boolean") {
        const j = as(e, Array.isArray(u.initial) ? u.initial[0] : u.initial);
        j && j.transition && (N.transition = j.transition);
      }
      h.forEach((j) => {
        const b = e.getBaseTarget(j), y = e.getValue(j);
        y && (y.liveStyle = !0), N[j] = b ?? null;
      }), m.push({ animation: N });
    }
    let g = !!m.length;
    return r && (u.initial === !1 || u.initial === u.animate) && !e.manuallyAnimateOnMount && (g = !1), r = !1, g ? t(m) : Promise.resolve();
  }
  function l(c, u) {
    if (n[c].isActive === u)
      return Promise.resolve();
    e.variantChildren?.forEach((m) => m.animationState?.setActive(c, u)), n[c].isActive = u;
    const d = o(c);
    for (const m in n)
      n[m].protectedKeys = {};
    return d;
  }
  return {
    animateChanges: o,
    setActive: l,
    setAnimateFunction: a,
    getState: () => n,
    reset: () => {
      n = za(), r = !0;
    }
  };
}
function Hf(e, t) {
  return typeof t == "string" ? t !== e : Array.isArray(t) ? !hc(t, e) : !1;
}
function Vt(e = !1) {
  return {
    isActive: e,
    protectedKeys: {},
    needsAnimating: {},
    prevResolvedValues: {}
  };
}
function za() {
  return {
    animate: Vt(!0),
    whileInView: Vt(),
    whileHover: Vt(),
    whileTap: Vt(),
    whileDrag: Vt(),
    whileFocus: Vt(),
    exit: Vt()
  };
}
class It {
  constructor(t) {
    this.isMounted = !1, this.node = t;
  }
  update() {
  }
}
class Gf extends It {
  /**
   * We dynamically generate the AnimationState manager as it contains a reference
   * to the underlying animation library. We only want to load that if we load this,
   * so people can optionally code split it out using the `m` component.
   */
  constructor(t) {
    super(t), t.animationState || (t.animationState = Uf(t));
  }
  updateAnimationControlsSubscription() {
    const { animate: t } = this.node.getProps();
    Un(t) && (this.unmountControls = t.subscribe(this.node));
  }
  /**
   * Subscribe any provided AnimationControls to the component's VisualElement
   */
  mount() {
    this.updateAnimationControlsSubscription();
  }
  update() {
    const { animate: t } = this.node.getProps(), { animate: n } = this.node.prevProps || {};
    t !== n && this.updateAnimationControlsSubscription();
  }
  unmount() {
    this.node.animationState.reset(), this.unmountControls?.();
  }
}
let Kf = 0;
class Yf extends It {
  constructor() {
    super(...arguments), this.id = Kf++;
  }
  update() {
    if (!this.node.presenceContext)
      return;
    const { isPresent: t, onExitComplete: n } = this.node.presenceContext, { isPresent: r } = this.node.prevPresenceContext || {};
    if (!this.node.animationState || t === r)
      return;
    const i = this.node.animationState.setActive("exit", !t);
    n && !t && i.then(() => {
      n(this.id);
    });
  }
  mount() {
    const { register: t, onExitComplete: n } = this.node.presenceContext || {};
    n && n(this.id), t && (this.unmount = t(this.id));
  }
  unmount() {
  }
}
const qf = {
  animation: {
    Feature: Gf
  },
  exit: {
    Feature: Yf
  }
};
function Bs(e, t, n, r = { passive: !0 }) {
  return e.addEventListener(t, n, r), () => e.removeEventListener(t, n);
}
function Ks(e) {
  return {
    point: {
      x: e.pageX,
      y: e.pageY
    }
  };
}
const Xf = (e) => (t) => Di(t) && e(t, Ks(t));
function Ms(e, t, n, r) {
  return Bs(e, t, Xf(n), r);
}
const pc = 1e-4, Zf = 1 - pc, Qf = 1 + pc, xc = 0.01, Jf = 0 - xc, ep = 0 + xc;
function Ze(e) {
  return e.max - e.min;
}
function tp(e, t, n) {
  return Math.abs(e - t) <= n;
}
function _a(e, t, n, r = 0.5) {
  e.origin = r, e.originPoint = Ce(t.min, t.max, e.origin), e.scale = Ze(n) / Ze(t), e.translate = Ce(n.min, n.max, e.origin) - e.originPoint, (e.scale >= Zf && e.scale <= Qf || isNaN(e.scale)) && (e.scale = 1), (e.translate >= Jf && e.translate <= ep || isNaN(e.translate)) && (e.translate = 0);
}
function Is(e, t, n, r) {
  _a(e.x, t.x, n.x, r ? r.originX : void 0), _a(e.y, t.y, n.y, r ? r.originY : void 0);
}
function $a(e, t, n) {
  e.min = n.min + t.min, e.max = e.min + Ze(t);
}
function sp(e, t, n) {
  $a(e.x, t.x, n.x), $a(e.y, t.y, n.y);
}
function Ba(e, t, n) {
  e.min = t.min - n.min, e.max = e.min + Ze(t);
}
function Ds(e, t, n) {
  Ba(e.x, t.x, n.x), Ba(e.y, t.y, n.y);
}
function it(e) {
  return [e("x"), e("y")];
}
const gc = ({ current: e }) => e ? e.ownerDocument.defaultView : null, Wa = (e, t) => Math.abs(e - t);
function np(e, t) {
  const n = Wa(e.x, t.x), r = Wa(e.y, t.y);
  return Math.sqrt(n ** 2 + r ** 2);
}
class bc {
  constructor(t, n, { transformPagePoint: r, contextWindow: i = window, dragSnapToOrigin: a = !1, distanceThreshold: o = 3 } = {}) {
    if (this.startEvent = null, this.lastMoveEvent = null, this.lastMoveEventInfo = null, this.handlers = {}, this.contextWindow = window, this.updatePoint = () => {
      if (!(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const h = ur(this.lastMoveEventInfo, this.history), f = this.startEvent !== null, v = np(h.offset, { x: 0, y: 0 }) >= this.distanceThreshold;
      if (!f && !v)
        return;
      const { point: g } = h, { timestamp: N } = ze;
      this.history.push({ ...g, timestamp: N });
      const { onStart: j, onMove: b } = this.handlers;
      f || (j && j(this.lastMoveEvent, h), this.startEvent = this.lastMoveEvent), b && b(this.lastMoveEvent, h);
    }, this.handlePointerMove = (h, f) => {
      this.lastMoveEvent = h, this.lastMoveEventInfo = dr(f, this.transformPagePoint), ye.update(this.updatePoint, !0);
    }, this.handlePointerUp = (h, f) => {
      this.end();
      const { onEnd: v, onSessionEnd: g, resumeAnimation: N } = this.handlers;
      if (this.dragSnapToOrigin && N && N(), !(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const j = ur(h.type === "pointercancel" ? this.lastMoveEventInfo : dr(f, this.transformPagePoint), this.history);
      this.startEvent && v && v(h, j), g && g(h, j);
    }, !Di(t))
      return;
    this.dragSnapToOrigin = a, this.handlers = n, this.transformPagePoint = r, this.distanceThreshold = o, this.contextWindow = i || window;
    const l = Ks(t), c = dr(l, this.transformPagePoint), { point: u } = c, { timestamp: d } = ze;
    this.history = [{ ...u, timestamp: d }];
    const { onSessionStart: m } = n;
    m && m(t, ur(c, this.history)), this.removeListeners = Us(Ms(this.contextWindow, "pointermove", this.handlePointerMove), Ms(this.contextWindow, "pointerup", this.handlePointerUp), Ms(this.contextWindow, "pointercancel", this.handlePointerUp));
  }
  updateHandlers(t) {
    this.handlers = t;
  }
  end() {
    this.removeListeners && this.removeListeners(), Rt(this.updatePoint);
  }
}
function dr(e, t) {
  return t ? { point: t(e.point) } : e;
}
function Ua(e, t) {
  return { x: e.x - t.x, y: e.y - t.y };
}
function ur({ point: e }, t) {
  return {
    point: e,
    delta: Ua(e, vc(t)),
    offset: Ua(e, rp(t)),
    velocity: ip(t, 0.1)
  };
}
function rp(e) {
  return e[0];
}
function vc(e) {
  return e[e.length - 1];
}
function ip(e, t) {
  if (e.length < 2)
    return { x: 0, y: 0 };
  let n = e.length - 1, r = null;
  const i = vc(e);
  for (; n >= 0 && (r = e[n], !(i.timestamp - r.timestamp > /* @__PURE__ */ ut(t))); )
    n--;
  if (!r)
    return { x: 0, y: 0 };
  const a = /* @__PURE__ */ pt(i.timestamp - r.timestamp);
  if (a === 0)
    return { x: 0, y: 0 };
  const o = {
    x: (i.x - r.x) / a,
    y: (i.y - r.y) / a
  };
  return o.x === 1 / 0 && (o.x = 0), o.y === 1 / 0 && (o.y = 0), o;
}
function ap(e, { min: t, max: n }, r) {
  return t !== void 0 && e < t ? e = r ? Ce(t, e, r.min) : Math.max(e, t) : n !== void 0 && e > n && (e = r ? Ce(n, e, r.max) : Math.min(e, n)), e;
}
function Ha(e, t, n) {
  return {
    min: t !== void 0 ? e.min + t : void 0,
    max: n !== void 0 ? e.max + n - (e.max - e.min) : void 0
  };
}
function op(e, { top: t, left: n, bottom: r, right: i }) {
  return {
    x: Ha(e.x, n, i),
    y: Ha(e.y, t, r)
  };
}
function Ga(e, t) {
  let n = t.min - e.min, r = t.max - e.max;
  return t.max - t.min < e.max - e.min && ([n, r] = [r, n]), { min: n, max: r };
}
function lp(e, t) {
  return {
    x: Ga(e.x, t.x),
    y: Ga(e.y, t.y)
  };
}
function cp(e, t) {
  let n = 0.5;
  const r = Ze(e), i = Ze(t);
  return i > r ? n = /* @__PURE__ */ Ls(t.min, t.max - r, e.min) : r > i && (n = /* @__PURE__ */ Ls(e.min, e.max - i, t.min)), Nt(0, 1, n);
}
function dp(e, t) {
  const n = {};
  return t.min !== void 0 && (n.min = t.min - e.min), t.max !== void 0 && (n.max = t.max - e.min), n;
}
const Zr = 0.35;
function up(e = Zr) {
  return e === !1 ? e = 0 : e === !0 && (e = Zr), {
    x: Ka(e, "left", "right"),
    y: Ka(e, "top", "bottom")
  };
}
function Ka(e, t, n) {
  return {
    min: Ya(e, t),
    max: Ya(e, n)
  };
}
function Ya(e, t) {
  return typeof e == "number" ? e : e[t] || 0;
}
const mp = /* @__PURE__ */ new WeakMap();
class hp {
  constructor(t) {
    this.openDragLock = null, this.isDragging = !1, this.currentDirection = null, this.originPoint = { x: 0, y: 0 }, this.constraints = !1, this.hasMutatedConstraints = !1, this.elastic = Ee(), this.latestPointerEvent = null, this.latestPanInfo = null, this.visualElement = t;
  }
  start(t, { snapToCursor: n = !1, distanceThreshold: r } = {}) {
    const { presenceContext: i } = this.visualElement;
    if (i && i.isPresent === !1)
      return;
    const a = (m) => {
      const { dragSnapToOrigin: h } = this.getProps();
      h ? this.pauseAnimation() : this.stopAnimation(), n && this.snapToCursor(Ks(m).point);
    }, o = (m, h) => {
      const { drag: f, dragPropagation: v, onDragStart: g } = this.getProps();
      if (f && !v && (this.openDragLock && this.openDragLock(), this.openDragLock = yh(f), !this.openDragLock))
        return;
      this.latestPointerEvent = m, this.latestPanInfo = h, this.isDragging = !0, this.currentDirection = null, this.resolveConstraints(), this.visualElement.projection && (this.visualElement.projection.isAnimationBlocked = !0, this.visualElement.projection.target = void 0), it((j) => {
        let b = this.getAxisMotionValue(j).get() || 0;
        if (xt.test(b)) {
          const { projection: y } = this.visualElement;
          if (y && y.layout) {
            const S = y.layout.layoutBox[j];
            S && (b = Ze(S) * (parseFloat(b) / 100));
          }
        }
        this.originPoint[j] = b;
      }), g && ye.postRender(() => g(m, h)), qr(this.visualElement, "transform");
      const { animationState: N } = this.visualElement;
      N && N.setActive("whileDrag", !0);
    }, l = (m, h) => {
      this.latestPointerEvent = m, this.latestPanInfo = h;
      const { dragPropagation: f, dragDirectionLock: v, onDirectionLock: g, onDrag: N } = this.getProps();
      if (!f && !this.openDragLock)
        return;
      const { offset: j } = h;
      if (v && this.currentDirection === null) {
        this.currentDirection = fp(j), this.currentDirection !== null && g && g(this.currentDirection);
        return;
      }
      this.updateAxis("x", h.point, j), this.updateAxis("y", h.point, j), this.visualElement.render(), N && N(m, h);
    }, c = (m, h) => {
      this.latestPointerEvent = m, this.latestPanInfo = h, this.stop(m, h), this.latestPointerEvent = null, this.latestPanInfo = null;
    }, u = () => it((m) => this.getAnimationState(m) === "paused" && this.getAxisMotionValue(m).animation?.play()), { dragSnapToOrigin: d } = this.getProps();
    this.panSession = new bc(t, {
      onSessionStart: a,
      onStart: o,
      onMove: l,
      onSessionEnd: c,
      resumeAnimation: u
    }, {
      transformPagePoint: this.visualElement.getTransformPagePoint(),
      dragSnapToOrigin: d,
      distanceThreshold: r,
      contextWindow: gc(this.visualElement)
    });
  }
  /**
   * @internal
   */
  stop(t, n) {
    const r = t || this.latestPointerEvent, i = n || this.latestPanInfo, a = this.isDragging;
    if (this.cancel(), !a || !i || !r)
      return;
    const { velocity: o } = i;
    this.startAnimation(o);
    const { onDragEnd: l } = this.getProps();
    l && ye.postRender(() => l(r, i));
  }
  /**
   * @internal
   */
  cancel() {
    this.isDragging = !1;
    const { projection: t, animationState: n } = this.visualElement;
    t && (t.isAnimationBlocked = !1), this.panSession && this.panSession.end(), this.panSession = void 0;
    const { dragPropagation: r } = this.getProps();
    !r && this.openDragLock && (this.openDragLock(), this.openDragLock = null), n && n.setActive("whileDrag", !1);
  }
  updateAxis(t, n, r) {
    const { drag: i } = this.getProps();
    if (!r || !ln(t, i, this.currentDirection))
      return;
    const a = this.getAxisMotionValue(t);
    let o = this.originPoint[t] + r[t];
    this.constraints && this.constraints[t] && (o = ap(o, this.constraints[t], this.elastic[t])), a.set(o);
  }
  resolveConstraints() {
    const { dragConstraints: t, dragElastic: n } = this.getProps(), r = this.visualElement.projection && !this.visualElement.projection.layout ? this.visualElement.projection.measure(!1) : this.visualElement.projection?.layout, i = this.constraints;
    t && ss(t) ? this.constraints || (this.constraints = this.resolveRefConstraints()) : t && r ? this.constraints = op(r.layoutBox, t) : this.constraints = !1, this.elastic = up(n), i !== this.constraints && r && this.constraints && !this.hasMutatedConstraints && it((a) => {
      this.constraints !== !1 && this.getAxisMotionValue(a) && (this.constraints[a] = dp(r.layoutBox[a], this.constraints[a]));
    });
  }
  resolveRefConstraints() {
    const { dragConstraints: t, onMeasureDragConstraints: n } = this.getProps();
    if (!t || !ss(t))
      return !1;
    const r = t.current;
    Ct(r !== null, "If `dragConstraints` is set as a React ref, that ref must be passed to another component's `ref` prop.", "drag-constraints-ref");
    const { projection: i } = this.visualElement;
    if (!i || !i.layout)
      return !1;
    const a = pf(r, i.root, this.visualElement.getTransformPagePoint());
    let o = lp(i.layout.layoutBox, a);
    if (n) {
      const l = n(mf(o));
      this.hasMutatedConstraints = !!l, l && (o = sc(l));
    }
    return o;
  }
  startAnimation(t) {
    const { drag: n, dragMomentum: r, dragElastic: i, dragTransition: a, dragSnapToOrigin: o, onDragTransitionEnd: l } = this.getProps(), c = this.constraints || {}, u = it((d) => {
      if (!ln(d, n, this.currentDirection))
        return;
      let m = c && c[d] || {};
      o && (m = { min: 0, max: 0 });
      const h = i ? 200 : 1e6, f = i ? 40 : 1e7, v = {
        type: "inertia",
        velocity: r ? t[d] : 0,
        bounceStiffness: h,
        bounceDamping: f,
        timeConstant: 750,
        restDelta: 1,
        restSpeed: 10,
        ...a,
        ...m
      };
      return this.startAxisValueAnimation(d, v);
    });
    return Promise.all(u).then(l);
  }
  startAxisValueAnimation(t, n) {
    const r = this.getAxisMotionValue(t);
    return qr(this.visualElement, t), r.start(Ui(t, r, 0, n, this.visualElement, !1));
  }
  stopAnimation() {
    it((t) => this.getAxisMotionValue(t).stop());
  }
  pauseAnimation() {
    it((t) => this.getAxisMotionValue(t).animation?.pause());
  }
  getAnimationState(t) {
    return this.getAxisMotionValue(t).animation?.state;
  }
  /**
   * Drag works differently depending on which props are provided.
   *
   * - If _dragX and _dragY are provided, we output the gesture delta directly to those motion values.
   * - Otherwise, we apply the delta to the x/y motion values.
   */
  getAxisMotionValue(t) {
    const n = `_drag${t.toUpperCase()}`, r = this.visualElement.getProps(), i = r[n];
    return i || this.visualElement.getValue(t, (r.initial ? r.initial[t] : void 0) || 0);
  }
  snapToCursor(t) {
    it((n) => {
      const { drag: r } = this.getProps();
      if (!ln(n, r, this.currentDirection))
        return;
      const { projection: i } = this.visualElement, a = this.getAxisMotionValue(n);
      if (i && i.layout) {
        const { min: o, max: l } = i.layout.layoutBox[n];
        a.set(t[n] - Ce(o, l, 0.5));
      }
    });
  }
  /**
   * When the viewport resizes we want to check if the measured constraints
   * have changed and, if so, reposition the element within those new constraints
   * relative to where it was before the resize.
   */
  scalePositionWithinConstraints() {
    if (!this.visualElement.current)
      return;
    const { drag: t, dragConstraints: n } = this.getProps(), { projection: r } = this.visualElement;
    if (!ss(n) || !r || !this.constraints)
      return;
    this.stopAnimation();
    const i = { x: 0, y: 0 };
    it((o) => {
      const l = this.getAxisMotionValue(o);
      if (l && this.constraints !== !1) {
        const c = l.get();
        i[o] = cp({ min: c, max: c }, this.constraints[o]);
      }
    });
    const { transformTemplate: a } = this.visualElement.getProps();
    this.visualElement.current.style.transform = a ? a({}, "") : "none", r.root && r.root.updateScroll(), r.updateLayout(), this.resolveConstraints(), it((o) => {
      if (!ln(o, t, null))
        return;
      const l = this.getAxisMotionValue(o), { min: c, max: u } = this.constraints[o];
      l.set(Ce(c, u, i[o]));
    });
  }
  addListeners() {
    if (!this.visualElement.current)
      return;
    mp.set(this.visualElement, this);
    const t = this.visualElement.current, n = Ms(t, "pointerdown", (c) => {
      const { drag: u, dragListener: d = !0 } = this.getProps();
      u && d && this.start(c);
    }), r = () => {
      const { dragConstraints: c } = this.getProps();
      ss(c) && c.current && (this.constraints = this.resolveRefConstraints());
    }, { projection: i } = this.visualElement, a = i.addEventListener("measure", r);
    i && !i.layout && (i.root && i.root.updateScroll(), i.updateLayout()), ye.read(r);
    const o = Bs(window, "resize", () => this.scalePositionWithinConstraints()), l = i.addEventListener("didUpdate", (({ delta: c, hasLayoutChanged: u }) => {
      this.isDragging && u && (it((d) => {
        const m = this.getAxisMotionValue(d);
        m && (this.originPoint[d] += c[d].translate, m.set(m.get() + c[d].translate));
      }), this.visualElement.render());
    }));
    return () => {
      o(), n(), a(), l && l();
    };
  }
  getProps() {
    const t = this.visualElement.getProps(), { drag: n = !1, dragDirectionLock: r = !1, dragPropagation: i = !1, dragConstraints: a = !1, dragElastic: o = Zr, dragMomentum: l = !0 } = t;
    return {
      ...t,
      drag: n,
      dragDirectionLock: r,
      dragPropagation: i,
      dragConstraints: a,
      dragElastic: o,
      dragMomentum: l
    };
  }
}
function ln(e, t, n) {
  return (t === !0 || t === e) && (n === null || n === e);
}
function fp(e, t = 10) {
  let n = null;
  return Math.abs(e.y) > t ? n = "y" : Math.abs(e.x) > t && (n = "x"), n;
}
class pp extends It {
  constructor(t) {
    super(t), this.removeGroupControls = ot, this.removeListeners = ot, this.controls = new hp(t);
  }
  mount() {
    const { dragControls: t } = this.node.getProps();
    t && (this.removeGroupControls = t.subscribe(this.controls)), this.removeListeners = this.controls.addListeners() || ot;
  }
  unmount() {
    this.removeGroupControls(), this.removeListeners();
  }
}
const qa = (e) => (t, n) => {
  e && ye.postRender(() => e(t, n));
};
class xp extends It {
  constructor() {
    super(...arguments), this.removePointerDownListener = ot;
  }
  onPointerDown(t) {
    this.session = new bc(t, this.createPanHandlers(), {
      transformPagePoint: this.node.getTransformPagePoint(),
      contextWindow: gc(this.node)
    });
  }
  createPanHandlers() {
    const { onPanSessionStart: t, onPanStart: n, onPan: r, onPanEnd: i } = this.node.getProps();
    return {
      onSessionStart: qa(t),
      onStart: qa(n),
      onMove: r,
      onEnd: (a, o) => {
        delete this.session, i && ye.postRender(() => i(a, o));
      }
    };
  }
  mount() {
    this.removePointerDownListener = Ms(this.node.current, "pointerdown", (t) => this.onPointerDown(t));
  }
  update() {
    this.session && this.session.updateHandlers(this.createPanHandlers());
  }
  unmount() {
    this.removePointerDownListener(), this.session && this.session.end();
  }
}
const Pn = {
  /**
   * Global flag as to whether the tree has animated since the last time
   * we resized the window
   */
  hasAnimatedSinceResize: !0,
  /**
   * We set this to true once, on the first update. Any nodes added to the tree beyond that
   * update will be given a `data-projection-id` attribute.
   */
  hasEverUpdated: !1
};
function Xa(e, t) {
  return t.max === t.min ? 0 : e / (t.max - t.min) * 100;
}
const Ns = {
  correct: (e, t) => {
    if (!t.target)
      return e;
    if (typeof e == "string")
      if (U.test(e))
        e = parseFloat(e);
      else
        return e;
    const n = Xa(e, t.target.x), r = Xa(e, t.target.y);
    return `${n}% ${r}%`;
  }
}, gp = {
  correct: (e, { treeScale: t, projectionDelta: n }) => {
    const r = e, i = Mt.parse(e);
    if (i.length > 5)
      return r;
    const a = Mt.createTransformer(e), o = typeof i[0] != "number" ? 1 : 0, l = n.x.scale * t.x, c = n.y.scale * t.y;
    i[0 + o] /= l, i[1 + o] /= c;
    const u = Ce(l, c, 0.5);
    return typeof i[2 + o] == "number" && (i[2 + o] /= u), typeof i[3 + o] == "number" && (i[3 + o] /= u), a(i);
  }
};
let mr = !1;
class bp extends Tu {
  /**
   * This only mounts projection nodes for components that
   * need measuring, we might want to do it for all components
   * in order to incorporate transforms
   */
  componentDidMount() {
    const { visualElement: t, layoutGroup: n, switchLayoutGroup: r, layoutId: i } = this.props, { projection: a } = t;
    zh(vp), a && (n.group && n.group.add(a), r && r.register && i && r.register(a), mr && a.root.didUpdate(), a.addEventListener("animationComplete", () => {
      this.safeToRemove();
    }), a.setOptions({
      ...a.options,
      onExitComplete: () => this.safeToRemove()
    })), Pn.hasEverUpdated = !0;
  }
  getSnapshotBeforeUpdate(t) {
    const { layoutDependency: n, visualElement: r, drag: i, isPresent: a } = this.props, { projection: o } = r;
    return o && (o.isPresent = a, mr = !0, i || t.layoutDependency !== n || n === void 0 || t.isPresent !== a ? o.willUpdate() : this.safeToRemove(), t.isPresent !== a && (a ? o.promote() : o.relegate() || ye.postRender(() => {
      const l = o.getStack();
      (!l || !l.members.length) && this.safeToRemove();
    }))), null;
  }
  componentDidUpdate() {
    const { projection: t } = this.props.visualElement;
    t && (t.root.didUpdate(), Ii.postRender(() => {
      !t.currentAnimation && t.isLead() && this.safeToRemove();
    }));
  }
  componentWillUnmount() {
    const { visualElement: t, layoutGroup: n, switchLayoutGroup: r } = this.props, { projection: i } = t;
    mr = !0, i && (i.scheduleCheckAfterUnmount(), n && n.group && n.group.remove(i), r && r.deregister && r.deregister(i));
  }
  safeToRemove() {
    const { safeToRemove: t } = this.props;
    t && t();
  }
  render() {
    return null;
  }
}
function yc(e) {
  const [t, n] = Bl(), r = We(ui);
  return s.jsx(bp, { ...e, layoutGroup: r, switchLayoutGroup: We(ec), isPresent: t, safeToRemove: n });
}
const vp = {
  borderRadius: {
    ...Ns,
    applyTo: [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomLeftRadius",
      "borderBottomRightRadius"
    ]
  },
  borderTopLeftRadius: Ns,
  borderTopRightRadius: Ns,
  borderBottomLeftRadius: Ns,
  borderBottomRightRadius: Ns,
  boxShadow: gp
};
function yp(e, t, n) {
  const r = Ue(e) ? e : ls(e);
  return r.start(Ui("", r, t, n)), r.animation;
}
const jp = (e, t) => e.depth - t.depth;
class wp {
  constructor() {
    this.children = [], this.isDirty = !1;
  }
  add(t) {
    fi(this.children, t), this.isDirty = !0;
  }
  remove(t) {
    pi(this.children, t), this.isDirty = !0;
  }
  forEach(t) {
    this.isDirty && this.children.sort(jp), this.isDirty = !1, this.children.forEach(t);
  }
}
function Np(e, t) {
  const n = et.now(), r = ({ timestamp: i }) => {
    const a = i - n;
    a >= t && (Rt(r), e(a - t));
  };
  return ye.setup(r, !0), () => Rt(r);
}
const jc = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"], Cp = jc.length, Za = (e) => typeof e == "string" ? parseFloat(e) : e, Qa = (e) => typeof e == "number" || U.test(e);
function Sp(e, t, n, r, i, a) {
  i ? (e.opacity = Ce(0, n.opacity ?? 1, kp(r)), e.opacityExit = Ce(t.opacity ?? 1, 0, Tp(r))) : a && (e.opacity = Ce(t.opacity ?? 1, n.opacity ?? 1, r));
  for (let o = 0; o < Cp; o++) {
    const l = `border${jc[o]}Radius`;
    let c = Ja(t, l), u = Ja(n, l);
    if (c === void 0 && u === void 0)
      continue;
    c || (c = 0), u || (u = 0), c === 0 || u === 0 || Qa(c) === Qa(u) ? (e[l] = Math.max(Ce(Za(c), Za(u), r), 0), (xt.test(u) || xt.test(c)) && (e[l] += "%")) : e[l] = u;
  }
  (t.rotate || n.rotate) && (e.rotate = Ce(t.rotate || 0, n.rotate || 0, r));
}
function Ja(e, t) {
  return e[t] !== void 0 ? e[t] : e.borderRadius;
}
const kp = /* @__PURE__ */ wc(0, 0.5, ll), Tp = /* @__PURE__ */ wc(0.5, 0.95, ot);
function wc(e, t, n) {
  return (r) => r < e ? 0 : r > t ? 1 : n(/* @__PURE__ */ Ls(e, t, r));
}
function eo(e, t) {
  e.min = t.min, e.max = t.max;
}
function rt(e, t) {
  eo(e.x, t.x), eo(e.y, t.y);
}
function to(e, t) {
  e.translate = t.translate, e.scale = t.scale, e.originPoint = t.originPoint, e.origin = t.origin;
}
function so(e, t, n, r, i) {
  return e -= t, e = Vn(e, 1 / n, r), i !== void 0 && (e = Vn(e, 1 / i, r)), e;
}
function Pp(e, t = 0, n = 1, r = 0.5, i, a = e, o = e) {
  if (xt.test(t) && (t = parseFloat(t), t = Ce(o.min, o.max, t / 100) - o.min), typeof t != "number")
    return;
  let l = Ce(a.min, a.max, r);
  e === a && (l -= t), e.min = so(e.min, t, n, l, i), e.max = so(e.max, t, n, l, i);
}
function no(e, t, [n, r, i], a, o) {
  Pp(e, t[n], t[r], t[i], t.scale, a, o);
}
const Ep = ["x", "scaleX", "originX"], Ap = ["y", "scaleY", "originY"];
function ro(e, t, n, r) {
  no(e.x, t, Ep, n ? n.x : void 0, r ? r.x : void 0), no(e.y, t, Ap, n ? n.y : void 0, r ? r.y : void 0);
}
function io(e) {
  return e.translate === 0 && e.scale === 1;
}
function Nc(e) {
  return io(e.x) && io(e.y);
}
function ao(e, t) {
  return e.min === t.min && e.max === t.max;
}
function Rp(e, t) {
  return ao(e.x, t.x) && ao(e.y, t.y);
}
function oo(e, t) {
  return Math.round(e.min) === Math.round(t.min) && Math.round(e.max) === Math.round(t.max);
}
function Cc(e, t) {
  return oo(e.x, t.x) && oo(e.y, t.y);
}
function lo(e) {
  return Ze(e.x) / Ze(e.y);
}
function co(e, t) {
  return e.translate === t.translate && e.scale === t.scale && e.originPoint === t.originPoint;
}
class Mp {
  constructor() {
    this.members = [];
  }
  add(t) {
    fi(this.members, t), t.scheduleRender();
  }
  remove(t) {
    if (pi(this.members, t), t === this.prevLead && (this.prevLead = void 0), t === this.lead) {
      const n = this.members[this.members.length - 1];
      n && this.promote(n);
    }
  }
  relegate(t) {
    const n = this.members.findIndex((i) => t === i);
    if (n === 0)
      return !1;
    let r;
    for (let i = n; i >= 0; i--) {
      const a = this.members[i];
      if (a.isPresent !== !1) {
        r = a;
        break;
      }
    }
    return r ? (this.promote(r), !0) : !1;
  }
  promote(t, n) {
    const r = this.lead;
    if (t !== r && (this.prevLead = r, this.lead = t, t.show(), r)) {
      r.instance && r.scheduleRender(), t.scheduleRender(), t.resumeFrom = r, n && (t.resumeFrom.preserveOpacity = !0), r.snapshot && (t.snapshot = r.snapshot, t.snapshot.latestValues = r.animationValues || r.latestValues), t.root && t.root.isUpdating && (t.isLayoutDirty = !0);
      const { crossfade: i } = t.options;
      i === !1 && r.hide();
    }
  }
  exitAnimationComplete() {
    this.members.forEach((t) => {
      const { options: n, resumingFrom: r } = t;
      n.onExitComplete && n.onExitComplete(), r && r.options.onExitComplete && r.options.onExitComplete();
    });
  }
  scheduleRender() {
    this.members.forEach((t) => {
      t.instance && t.scheduleRender(!1);
    });
  }
  /**
   * Clear any leads that have been removed this render to prevent them from being
   * used in future animations and to prevent memory leaks
   */
  removeLeadSnapshot() {
    this.lead && this.lead.snapshot && (this.lead.snapshot = void 0);
  }
}
function Ip(e, t, n) {
  let r = "";
  const i = e.x.translate / t.x, a = e.y.translate / t.y, o = n?.z || 0;
  if ((i || a || o) && (r = `translate3d(${i}px, ${a}px, ${o}px) `), (t.x !== 1 || t.y !== 1) && (r += `scale(${1 / t.x}, ${1 / t.y}) `), n) {
    const { transformPerspective: u, rotate: d, rotateX: m, rotateY: h, skewX: f, skewY: v } = n;
    u && (r = `perspective(${u}px) ${r}`), d && (r += `rotate(${d}deg) `), m && (r += `rotateX(${m}deg) `), h && (r += `rotateY(${h}deg) `), f && (r += `skewX(${f}deg) `), v && (r += `skewY(${v}deg) `);
  }
  const l = e.x.scale * t.x, c = e.y.scale * t.y;
  return (l !== 1 || c !== 1) && (r += `scale(${l}, ${c})`), r || "none";
}
const hr = ["", "X", "Y", "Z"], Dp = 1e3;
let Op = 0;
function fr(e, t, n, r) {
  const { latestValues: i } = t;
  i[e] && (n[e] = i[e], t.setStaticValue(e, 0), r && (r[e] = 0));
}
function Sc(e) {
  if (e.hasCheckedOptimisedAppear = !0, e.root === e)
    return;
  const { visualElement: t } = e.options;
  if (!t)
    return;
  const n = dc(t);
  if (window.MotionHasOptimisedAnimation(n, "transform")) {
    const { layout: i, layoutId: a } = e.options;
    window.MotionCancelOptimisedAnimation(n, "transform", ye, !(i || a));
  }
  const { parent: r } = e;
  r && !r.hasCheckedOptimisedAppear && Sc(r);
}
function kc({ attachResizeListener: e, defaultParent: t, measureScroll: n, checkIsScrollRoot: r, resetTransform: i }) {
  return class {
    constructor(o = {}, l = t?.()) {
      this.id = Op++, this.animationId = 0, this.animationCommitId = 0, this.children = /* @__PURE__ */ new Set(), this.options = {}, this.isTreeAnimating = !1, this.isAnimationBlocked = !1, this.isLayoutDirty = !1, this.isProjectionDirty = !1, this.isSharedProjectionDirty = !1, this.isTransformDirty = !1, this.updateManuallyBlocked = !1, this.updateBlockedByResize = !1, this.isUpdating = !1, this.isSVG = !1, this.needsReset = !1, this.shouldResetTransform = !1, this.hasCheckedOptimisedAppear = !1, this.treeScale = { x: 1, y: 1 }, this.eventHandlers = /* @__PURE__ */ new Map(), this.hasTreeAnimated = !1, this.updateScheduled = !1, this.scheduleUpdate = () => this.update(), this.projectionUpdateScheduled = !1, this.checkUpdateFailed = () => {
        this.isUpdating && (this.isUpdating = !1, this.clearAllSnapshots());
      }, this.updateProjection = () => {
        this.projectionUpdateScheduled = !1, this.nodes.forEach(Fp), this.nodes.forEach(Bp), this.nodes.forEach(Wp), this.nodes.forEach(zp);
      }, this.resolvedRelativeTargetAt = 0, this.hasProjected = !1, this.isVisible = !0, this.animationProgress = 0, this.sharedNodes = /* @__PURE__ */ new Map(), this.latestValues = o, this.root = l ? l.root || l : this, this.path = l ? [...l.path, l] : [], this.parent = l, this.depth = l ? l.depth + 1 : 0;
      for (let c = 0; c < this.path.length; c++)
        this.path[c].shouldResetTransform = !0;
      this.root === this && (this.nodes = new wp());
    }
    addEventListener(o, l) {
      return this.eventHandlers.has(o) || this.eventHandlers.set(o, new gi()), this.eventHandlers.get(o).add(l);
    }
    notifyListeners(o, ...l) {
      const c = this.eventHandlers.get(o);
      c && c.notify(...l);
    }
    hasListeners(o) {
      return this.eventHandlers.has(o);
    }
    /**
     * Lifecycles
     */
    mount(o) {
      if (this.instance)
        return;
      this.isSVG = $l(o) && !kh(o), this.instance = o;
      const { layoutId: l, layout: c, visualElement: u } = this.options;
      if (u && !u.current && u.mount(o), this.root.nodes.add(this), this.parent && this.parent.children.add(this), this.root.hasTreeAnimated && (c || l) && (this.isLayoutDirty = !0), e) {
        let d, m = 0;
        const h = () => this.root.updateBlockedByResize = !1;
        ye.read(() => {
          m = window.innerWidth;
        }), e(o, () => {
          const f = window.innerWidth;
          f !== m && (m = f, this.root.updateBlockedByResize = !0, d && d(), d = Np(h, 250), Pn.hasAnimatedSinceResize && (Pn.hasAnimatedSinceResize = !1, this.nodes.forEach(ho)));
        });
      }
      l && this.root.registerSharedNode(l, this), this.options.animate !== !1 && u && (l || c) && this.addEventListener("didUpdate", ({ delta: d, hasLayoutChanged: m, hasRelativeLayoutChanged: h, layout: f }) => {
        if (this.isTreeAnimationBlocked()) {
          this.target = void 0, this.relativeTarget = void 0;
          return;
        }
        const v = this.options.transition || u.getDefaultTransition() || Yp, { onLayoutAnimationStart: g, onLayoutAnimationComplete: N } = u.getProps(), j = !this.targetLayout || !Cc(this.targetLayout, f), b = !m && h;
        if (this.options.layoutRoot || this.resumeFrom || b || m && (j || !this.currentAnimation)) {
          this.resumeFrom && (this.resumingFrom = this.resumeFrom, this.resumingFrom.resumingFrom = void 0);
          const y = {
            ...Ri(v, "layout"),
            onPlay: g,
            onComplete: N
          };
          (u.shouldReduceMotion || this.options.layoutRoot) && (y.delay = 0, y.type = !1), this.startAnimation(y), this.setAnimationOrigin(d, b);
        } else
          m || ho(this), this.isLead() && this.options.onExitComplete && this.options.onExitComplete();
        this.targetLayout = f;
      });
    }
    unmount() {
      this.options.layoutId && this.willUpdate(), this.root.nodes.remove(this);
      const o = this.getStack();
      o && o.remove(this), this.parent && this.parent.children.delete(this), this.instance = void 0, this.eventHandlers.clear(), Rt(this.updateProjection);
    }
    // only on the root
    blockUpdate() {
      this.updateManuallyBlocked = !0;
    }
    unblockUpdate() {
      this.updateManuallyBlocked = !1;
    }
    isUpdateBlocked() {
      return this.updateManuallyBlocked || this.updateBlockedByResize;
    }
    isTreeAnimationBlocked() {
      return this.isAnimationBlocked || this.parent && this.parent.isTreeAnimationBlocked() || !1;
    }
    // Note: currently only running on root node
    startUpdate() {
      this.isUpdateBlocked() || (this.isUpdating = !0, this.nodes && this.nodes.forEach(Up), this.animationId++);
    }
    getTransformTemplate() {
      const { visualElement: o } = this.options;
      return o && o.getProps().transformTemplate;
    }
    willUpdate(o = !0) {
      if (this.root.hasTreeAnimated = !0, this.root.isUpdateBlocked()) {
        this.options.onExitComplete && this.options.onExitComplete();
        return;
      }
      if (window.MotionCancelOptimisedAnimation && !this.hasCheckedOptimisedAppear && Sc(this), !this.root.isUpdating && this.root.startUpdate(), this.isLayoutDirty)
        return;
      this.isLayoutDirty = !0;
      for (let d = 0; d < this.path.length; d++) {
        const m = this.path[d];
        m.shouldResetTransform = !0, m.updateScroll("snapshot"), m.options.layoutRoot && m.willUpdate(!1);
      }
      const { layoutId: l, layout: c } = this.options;
      if (l === void 0 && !c)
        return;
      const u = this.getTransformTemplate();
      this.prevTransformTemplateValue = u ? u(this.latestValues, "") : void 0, this.updateSnapshot(), o && this.notifyListeners("willUpdate");
    }
    update() {
      if (this.updateScheduled = !1, this.isUpdateBlocked()) {
        this.unblockUpdate(), this.clearAllSnapshots(), this.nodes.forEach(uo);
        return;
      }
      if (this.animationId <= this.animationCommitId) {
        this.nodes.forEach(mo);
        return;
      }
      this.animationCommitId = this.animationId, this.isUpdating ? (this.isUpdating = !1, this.nodes.forEach($p), this.nodes.forEach(Vp), this.nodes.forEach(Lp)) : this.nodes.forEach(mo), this.clearAllSnapshots();
      const l = et.now();
      ze.delta = Nt(0, 1e3 / 60, l - ze.timestamp), ze.timestamp = l, ze.isProcessing = !0, sr.update.process(ze), sr.preRender.process(ze), sr.render.process(ze), ze.isProcessing = !1;
    }
    didUpdate() {
      this.updateScheduled || (this.updateScheduled = !0, Ii.read(this.scheduleUpdate));
    }
    clearAllSnapshots() {
      this.nodes.forEach(_p), this.sharedNodes.forEach(Hp);
    }
    scheduleUpdateProjection() {
      this.projectionUpdateScheduled || (this.projectionUpdateScheduled = !0, ye.preRender(this.updateProjection, !1, !0));
    }
    scheduleCheckAfterUnmount() {
      ye.postRender(() => {
        this.isLayoutDirty ? this.root.didUpdate() : this.root.checkUpdateFailed();
      });
    }
    /**
     * Update measurements
     */
    updateSnapshot() {
      this.snapshot || !this.instance || (this.snapshot = this.measure(), this.snapshot && !Ze(this.snapshot.measuredBox.x) && !Ze(this.snapshot.measuredBox.y) && (this.snapshot = void 0));
    }
    updateLayout() {
      if (!this.instance || (this.updateScroll(), !(this.options.alwaysMeasureLayout && this.isLead()) && !this.isLayoutDirty))
        return;
      if (this.resumeFrom && !this.resumeFrom.instance)
        for (let c = 0; c < this.path.length; c++)
          this.path[c].updateScroll();
      const o = this.layout;
      this.layout = this.measure(!1), this.layoutCorrected = Ee(), this.isLayoutDirty = !1, this.projectionDelta = void 0, this.notifyListeners("measure", this.layout.layoutBox);
      const { visualElement: l } = this.options;
      l && l.notify("LayoutMeasure", this.layout.layoutBox, o ? o.layoutBox : void 0);
    }
    updateScroll(o = "measure") {
      let l = !!(this.options.layoutScroll && this.instance);
      if (this.scroll && this.scroll.animationId === this.root.animationId && this.scroll.phase === o && (l = !1), l && this.instance) {
        const c = r(this.instance);
        this.scroll = {
          animationId: this.root.animationId,
          phase: o,
          isRoot: c,
          offset: n(this.instance),
          wasRoot: this.scroll ? this.scroll.isRoot : c
        };
      }
    }
    resetTransform() {
      if (!i)
        return;
      const o = this.isLayoutDirty || this.shouldResetTransform || this.options.alwaysMeasureLayout, l = this.projectionDelta && !Nc(this.projectionDelta), c = this.getTransformTemplate(), u = c ? c(this.latestValues, "") : void 0, d = u !== this.prevTransformTemplateValue;
      o && this.instance && (l || zt(this.latestValues) || d) && (i(this.instance, u), this.shouldResetTransform = !1, this.scheduleRender());
    }
    measure(o = !0) {
      const l = this.measurePageBox();
      let c = this.removeElementScroll(l);
      return o && (c = this.removeTransform(c)), qp(c), {
        animationId: this.root.animationId,
        measuredBox: l,
        layoutBox: c,
        latestValues: {},
        source: this.id
      };
    }
    measurePageBox() {
      const { visualElement: o } = this.options;
      if (!o)
        return Ee();
      const l = o.measureViewportBox();
      if (!(this.scroll?.wasRoot || this.path.some(Xp))) {
        const { scroll: u } = this.root;
        u && (ns(l.x, u.offset.x), ns(l.y, u.offset.y));
      }
      return l;
    }
    removeElementScroll(o) {
      const l = Ee();
      if (rt(l, o), this.scroll?.wasRoot)
        return l;
      for (let c = 0; c < this.path.length; c++) {
        const u = this.path[c], { scroll: d, options: m } = u;
        u !== this.root && d && m.layoutScroll && (d.wasRoot && rt(l, o), ns(l.x, d.offset.x), ns(l.y, d.offset.y));
      }
      return l;
    }
    applyTransform(o, l = !1) {
      const c = Ee();
      rt(c, o);
      for (let u = 0; u < this.path.length; u++) {
        const d = this.path[u];
        !l && d.options.layoutScroll && d.scroll && d !== d.root && rs(c, {
          x: -d.scroll.offset.x,
          y: -d.scroll.offset.y
        }), zt(d.latestValues) && rs(c, d.latestValues);
      }
      return zt(this.latestValues) && rs(c, this.latestValues), c;
    }
    removeTransform(o) {
      const l = Ee();
      rt(l, o);
      for (let c = 0; c < this.path.length; c++) {
        const u = this.path[c];
        if (!u.instance || !zt(u.latestValues))
          continue;
        Hr(u.latestValues) && u.updateSnapshot();
        const d = Ee(), m = u.measurePageBox();
        rt(d, m), ro(l, u.latestValues, u.snapshot ? u.snapshot.layoutBox : void 0, d);
      }
      return zt(this.latestValues) && ro(l, this.latestValues), l;
    }
    setTargetDelta(o) {
      this.targetDelta = o, this.root.scheduleUpdateProjection(), this.isProjectionDirty = !0;
    }
    setOptions(o) {
      this.options = {
        ...this.options,
        ...o,
        crossfade: o.crossfade !== void 0 ? o.crossfade : !0
      };
    }
    clearMeasurements() {
      this.scroll = void 0, this.layout = void 0, this.snapshot = void 0, this.prevTransformTemplateValue = void 0, this.targetDelta = void 0, this.target = void 0, this.isLayoutDirty = !1;
    }
    forceRelativeParentToResolveTarget() {
      this.relativeParent && this.relativeParent.resolvedRelativeTargetAt !== ze.timestamp && this.relativeParent.resolveTargetDelta(!0);
    }
    resolveTargetDelta(o = !1) {
      const l = this.getLead();
      this.isProjectionDirty || (this.isProjectionDirty = l.isProjectionDirty), this.isTransformDirty || (this.isTransformDirty = l.isTransformDirty), this.isSharedProjectionDirty || (this.isSharedProjectionDirty = l.isSharedProjectionDirty);
      const c = !!this.resumingFrom || this !== l;
      if (!(o || c && this.isSharedProjectionDirty || this.isProjectionDirty || this.parent?.isProjectionDirty || this.attemptToResolveRelativeTarget || this.root.updateBlockedByResize))
        return;
      const { layout: d, layoutId: m } = this.options;
      if (!(!this.layout || !(d || m))) {
        if (this.resolvedRelativeTargetAt = ze.timestamp, !this.targetDelta && !this.relativeTarget) {
          const h = this.getClosestProjectingParent();
          h && h.layout && this.animationProgress !== 1 ? (this.relativeParent = h, this.forceRelativeParentToResolveTarget(), this.relativeTarget = Ee(), this.relativeTargetOrigin = Ee(), Ds(this.relativeTargetOrigin, this.layout.layoutBox, h.layout.layoutBox), rt(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
        }
        if (!(!this.relativeTarget && !this.targetDelta) && (this.target || (this.target = Ee(), this.targetWithTransforms = Ee()), this.relativeTarget && this.relativeTargetOrigin && this.relativeParent && this.relativeParent.target ? (this.forceRelativeParentToResolveTarget(), sp(this.target, this.relativeTarget, this.relativeParent.target)) : this.targetDelta ? (this.resumingFrom ? this.target = this.applyTransform(this.layout.layoutBox) : rt(this.target, this.layout.layoutBox), rc(this.target, this.targetDelta)) : rt(this.target, this.layout.layoutBox), this.attemptToResolveRelativeTarget)) {
          this.attemptToResolveRelativeTarget = !1;
          const h = this.getClosestProjectingParent();
          h && !!h.resumingFrom == !!this.resumingFrom && !h.options.layoutScroll && h.target && this.animationProgress !== 1 ? (this.relativeParent = h, this.forceRelativeParentToResolveTarget(), this.relativeTarget = Ee(), this.relativeTargetOrigin = Ee(), Ds(this.relativeTargetOrigin, this.target, h.target), rt(this.relativeTarget, this.relativeTargetOrigin)) : this.relativeParent = this.relativeTarget = void 0;
        }
      }
    }
    getClosestProjectingParent() {
      if (!(!this.parent || Hr(this.parent.latestValues) || nc(this.parent.latestValues)))
        return this.parent.isProjecting() ? this.parent : this.parent.getClosestProjectingParent();
    }
    isProjecting() {
      return !!((this.relativeTarget || this.targetDelta || this.options.layoutRoot) && this.layout);
    }
    calcProjection() {
      const o = this.getLead(), l = !!this.resumingFrom || this !== o;
      let c = !0;
      if ((this.isProjectionDirty || this.parent?.isProjectionDirty) && (c = !1), l && (this.isSharedProjectionDirty || this.isTransformDirty) && (c = !1), this.resolvedRelativeTargetAt === ze.timestamp && (c = !1), c)
        return;
      const { layout: u, layoutId: d } = this.options;
      if (this.isTreeAnimating = !!(this.parent && this.parent.isTreeAnimating || this.currentAnimation || this.pendingAnimation), this.isTreeAnimating || (this.targetDelta = this.relativeTarget = void 0), !this.layout || !(u || d))
        return;
      rt(this.layoutCorrected, this.layout.layoutBox);
      const m = this.treeScale.x, h = this.treeScale.y;
      ff(this.layoutCorrected, this.treeScale, this.path, l), o.layout && !o.target && (this.treeScale.x !== 1 || this.treeScale.y !== 1) && (o.target = o.layout.layoutBox, o.targetWithTransforms = Ee());
      const { target: f } = o;
      if (!f) {
        this.prevProjectionDelta && (this.createProjectionDeltas(), this.scheduleRender());
        return;
      }
      !this.projectionDelta || !this.prevProjectionDelta ? this.createProjectionDeltas() : (to(this.prevProjectionDelta.x, this.projectionDelta.x), to(this.prevProjectionDelta.y, this.projectionDelta.y)), Is(this.projectionDelta, this.layoutCorrected, f, this.latestValues), (this.treeScale.x !== m || this.treeScale.y !== h || !co(this.projectionDelta.x, this.prevProjectionDelta.x) || !co(this.projectionDelta.y, this.prevProjectionDelta.y)) && (this.hasProjected = !0, this.scheduleRender(), this.notifyListeners("projectionUpdate", f));
    }
    hide() {
      this.isVisible = !1;
    }
    show() {
      this.isVisible = !0;
    }
    scheduleRender(o = !0) {
      if (this.options.visualElement?.scheduleRender(), o) {
        const l = this.getStack();
        l && l.scheduleRender();
      }
      this.resumingFrom && !this.resumingFrom.instance && (this.resumingFrom = void 0);
    }
    createProjectionDeltas() {
      this.prevProjectionDelta = is(), this.projectionDelta = is(), this.projectionDeltaWithTransform = is();
    }
    setAnimationOrigin(o, l = !1) {
      const c = this.snapshot, u = c ? c.latestValues : {}, d = { ...this.latestValues }, m = is();
      (!this.relativeParent || !this.relativeParent.options.layoutRoot) && (this.relativeTarget = this.relativeTargetOrigin = void 0), this.attemptToResolveRelativeTarget = !l;
      const h = Ee(), f = c ? c.source : void 0, v = this.layout ? this.layout.source : void 0, g = f !== v, N = this.getStack(), j = !N || N.members.length <= 1, b = !!(g && !j && this.options.crossfade === !0 && !this.path.some(Kp));
      this.animationProgress = 0;
      let y;
      this.mixTargetDelta = (S) => {
        const T = S / 1e3;
        fo(m.x, o.x, T), fo(m.y, o.y, T), this.setTargetDelta(m), this.relativeTarget && this.relativeTargetOrigin && this.layout && this.relativeParent && this.relativeParent.layout && (Ds(h, this.layout.layoutBox, this.relativeParent.layout.layoutBox), Gp(this.relativeTarget, this.relativeTargetOrigin, h, T), y && Rp(this.relativeTarget, y) && (this.isProjectionDirty = !1), y || (y = Ee()), rt(y, this.relativeTarget)), g && (this.animationValues = d, Sp(d, u, this.latestValues, T, b, j)), this.root.scheduleUpdateProjection(), this.scheduleRender(), this.animationProgress = T;
      }, this.mixTargetDelta(this.options.layoutRoot ? 1e3 : 0);
    }
    startAnimation(o) {
      this.notifyListeners("animationStart"), this.currentAnimation?.stop(), this.resumingFrom?.currentAnimation?.stop(), this.pendingAnimation && (Rt(this.pendingAnimation), this.pendingAnimation = void 0), this.pendingAnimation = ye.update(() => {
        Pn.hasAnimatedSinceResize = !0, this.motionValue || (this.motionValue = ls(0)), this.currentAnimation = yp(this.motionValue, [0, 1e3], {
          ...o,
          velocity: 0,
          isSync: !0,
          onUpdate: (l) => {
            this.mixTargetDelta(l), o.onUpdate && o.onUpdate(l);
          },
          onStop: () => {
          },
          onComplete: () => {
            o.onComplete && o.onComplete(), this.completeAnimation();
          }
        }), this.resumingFrom && (this.resumingFrom.currentAnimation = this.currentAnimation), this.pendingAnimation = void 0;
      });
    }
    completeAnimation() {
      this.resumingFrom && (this.resumingFrom.currentAnimation = void 0, this.resumingFrom.preserveOpacity = void 0);
      const o = this.getStack();
      o && o.exitAnimationComplete(), this.resumingFrom = this.currentAnimation = this.animationValues = void 0, this.notifyListeners("animationComplete");
    }
    finishAnimation() {
      this.currentAnimation && (this.mixTargetDelta && this.mixTargetDelta(Dp), this.currentAnimation.stop()), this.completeAnimation();
    }
    applyTransformsToTarget() {
      const o = this.getLead();
      let { targetWithTransforms: l, target: c, layout: u, latestValues: d } = o;
      if (!(!l || !c || !u)) {
        if (this !== o && this.layout && u && Tc(this.options.animationType, this.layout.layoutBox, u.layoutBox)) {
          c = this.target || Ee();
          const m = Ze(this.layout.layoutBox.x);
          c.x.min = o.target.x.min, c.x.max = c.x.min + m;
          const h = Ze(this.layout.layoutBox.y);
          c.y.min = o.target.y.min, c.y.max = c.y.min + h;
        }
        rt(l, c), rs(l, d), Is(this.projectionDeltaWithTransform, this.layoutCorrected, l, d);
      }
    }
    registerSharedNode(o, l) {
      this.sharedNodes.has(o) || this.sharedNodes.set(o, new Mp()), this.sharedNodes.get(o).add(l);
      const u = l.options.initialPromotionConfig;
      l.promote({
        transition: u ? u.transition : void 0,
        preserveFollowOpacity: u && u.shouldPreserveFollowOpacity ? u.shouldPreserveFollowOpacity(l) : void 0
      });
    }
    isLead() {
      const o = this.getStack();
      return o ? o.lead === this : !0;
    }
    getLead() {
      const { layoutId: o } = this.options;
      return o ? this.getStack()?.lead || this : this;
    }
    getPrevLead() {
      const { layoutId: o } = this.options;
      return o ? this.getStack()?.prevLead : void 0;
    }
    getStack() {
      const { layoutId: o } = this.options;
      if (o)
        return this.root.sharedNodes.get(o);
    }
    promote({ needsReset: o, transition: l, preserveFollowOpacity: c } = {}) {
      const u = this.getStack();
      u && u.promote(this, c), o && (this.projectionDelta = void 0, this.needsReset = !0), l && this.setOptions({ transition: l });
    }
    relegate() {
      const o = this.getStack();
      return o ? o.relegate(this) : !1;
    }
    resetSkewAndRotation() {
      const { visualElement: o } = this.options;
      if (!o)
        return;
      let l = !1;
      const { latestValues: c } = o;
      if ((c.z || c.rotate || c.rotateX || c.rotateY || c.rotateZ || c.skewX || c.skewY) && (l = !0), !l)
        return;
      const u = {};
      c.z && fr("z", o, u, this.animationValues);
      for (let d = 0; d < hr.length; d++)
        fr(`rotate${hr[d]}`, o, u, this.animationValues), fr(`skew${hr[d]}`, o, u, this.animationValues);
      o.render();
      for (const d in u)
        o.setStaticValue(d, u[d]), this.animationValues && (this.animationValues[d] = u[d]);
      o.scheduleRender();
    }
    applyProjectionStyles(o, l) {
      if (!this.instance || this.isSVG)
        return;
      if (!this.isVisible) {
        o.visibility = "hidden";
        return;
      }
      const c = this.getTransformTemplate();
      if (this.needsReset) {
        this.needsReset = !1, o.visibility = "", o.opacity = "", o.pointerEvents = Tn(l?.pointerEvents) || "", o.transform = c ? c(this.latestValues, "") : "none";
        return;
      }
      const u = this.getLead();
      if (!this.projectionDelta || !this.layout || !u.target) {
        this.options.layoutId && (o.opacity = this.latestValues.opacity !== void 0 ? this.latestValues.opacity : 1, o.pointerEvents = Tn(l?.pointerEvents) || ""), this.hasProjected && !zt(this.latestValues) && (o.transform = c ? c({}, "") : "none", this.hasProjected = !1);
        return;
      }
      o.visibility = "";
      const d = u.animationValues || u.latestValues;
      this.applyTransformsToTarget();
      let m = Ip(this.projectionDeltaWithTransform, this.treeScale, d);
      c && (m = c(d, m)), o.transform = m;
      const { x: h, y: f } = this.projectionDelta;
      o.transformOrigin = `${h.origin * 100}% ${f.origin * 100}% 0`, u.animationValues ? o.opacity = u === this ? d.opacity ?? this.latestValues.opacity ?? 1 : this.preserveOpacity ? this.latestValues.opacity : d.opacityExit : o.opacity = u === this ? d.opacity !== void 0 ? d.opacity : "" : d.opacityExit !== void 0 ? d.opacityExit : 0;
      for (const v in $s) {
        if (d[v] === void 0)
          continue;
        const { correct: g, applyTo: N, isCSSVariable: j } = $s[v], b = m === "none" ? d[v] : g(d[v], u);
        if (N) {
          const y = N.length;
          for (let S = 0; S < y; S++)
            o[N[S]] = b;
        } else
          j ? this.options.visualElement.renderState.vars[v] = b : o[v] = b;
      }
      this.options.layoutId && (o.pointerEvents = u === this ? Tn(l?.pointerEvents) || "" : "none");
    }
    clearSnapshot() {
      this.resumeFrom = this.snapshot = void 0;
    }
    // Only run on root
    resetTree() {
      this.root.nodes.forEach((o) => o.currentAnimation?.stop()), this.root.nodes.forEach(uo), this.root.sharedNodes.clear();
    }
  };
}
function Vp(e) {
  e.updateLayout();
}
function Lp(e) {
  const t = e.resumeFrom?.snapshot || e.snapshot;
  if (e.isLead() && e.layout && t && e.hasListeners("didUpdate")) {
    const { layoutBox: n, measuredBox: r } = e.layout, { animationType: i } = e.options, a = t.source !== e.layout.source;
    i === "size" ? it((d) => {
      const m = a ? t.measuredBox[d] : t.layoutBox[d], h = Ze(m);
      m.min = n[d].min, m.max = m.min + h;
    }) : Tc(i, t.layoutBox, n) && it((d) => {
      const m = a ? t.measuredBox[d] : t.layoutBox[d], h = Ze(n[d]);
      m.max = m.min + h, e.relativeTarget && !e.currentAnimation && (e.isProjectionDirty = !0, e.relativeTarget[d].max = e.relativeTarget[d].min + h);
    });
    const o = is();
    Is(o, n, t.layoutBox);
    const l = is();
    a ? Is(l, e.applyTransform(r, !0), t.measuredBox) : Is(l, n, t.layoutBox);
    const c = !Nc(o);
    let u = !1;
    if (!e.resumeFrom) {
      const d = e.getClosestProjectingParent();
      if (d && !d.resumeFrom) {
        const { snapshot: m, layout: h } = d;
        if (m && h) {
          const f = Ee();
          Ds(f, t.layoutBox, m.layoutBox);
          const v = Ee();
          Ds(v, n, h.layoutBox), Cc(f, v) || (u = !0), d.options.layoutRoot && (e.relativeTarget = v, e.relativeTargetOrigin = f, e.relativeParent = d);
        }
      }
    }
    e.notifyListeners("didUpdate", {
      layout: n,
      snapshot: t,
      delta: l,
      layoutDelta: o,
      hasLayoutChanged: c,
      hasRelativeLayoutChanged: u
    });
  } else if (e.isLead()) {
    const { onExitComplete: n } = e.options;
    n && n();
  }
  e.options.transition = void 0;
}
function Fp(e) {
  e.parent && (e.isProjecting() || (e.isProjectionDirty = e.parent.isProjectionDirty), e.isSharedProjectionDirty || (e.isSharedProjectionDirty = !!(e.isProjectionDirty || e.parent.isProjectionDirty || e.parent.isSharedProjectionDirty)), e.isTransformDirty || (e.isTransformDirty = e.parent.isTransformDirty));
}
function zp(e) {
  e.isProjectionDirty = e.isSharedProjectionDirty = e.isTransformDirty = !1;
}
function _p(e) {
  e.clearSnapshot();
}
function uo(e) {
  e.clearMeasurements();
}
function mo(e) {
  e.isLayoutDirty = !1;
}
function $p(e) {
  const { visualElement: t } = e.options;
  t && t.getProps().onBeforeLayoutMeasure && t.notify("BeforeLayoutMeasure"), e.resetTransform();
}
function ho(e) {
  e.finishAnimation(), e.targetDelta = e.relativeTarget = e.target = void 0, e.isProjectionDirty = !0;
}
function Bp(e) {
  e.resolveTargetDelta();
}
function Wp(e) {
  e.calcProjection();
}
function Up(e) {
  e.resetSkewAndRotation();
}
function Hp(e) {
  e.removeLeadSnapshot();
}
function fo(e, t, n) {
  e.translate = Ce(t.translate, 0, n), e.scale = Ce(t.scale, 1, n), e.origin = t.origin, e.originPoint = t.originPoint;
}
function po(e, t, n, r) {
  e.min = Ce(t.min, n.min, r), e.max = Ce(t.max, n.max, r);
}
function Gp(e, t, n, r) {
  po(e.x, t.x, n.x, r), po(e.y, t.y, n.y, r);
}
function Kp(e) {
  return e.animationValues && e.animationValues.opacityExit !== void 0;
}
const Yp = {
  duration: 0.45,
  ease: [0.4, 0, 0.1, 1]
}, xo = (e) => typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().includes(e), go = xo("applewebkit/") && !xo("chrome/") ? Math.round : ot;
function bo(e) {
  e.min = go(e.min), e.max = go(e.max);
}
function qp(e) {
  bo(e.x), bo(e.y);
}
function Tc(e, t, n) {
  return e === "position" || e === "preserve-aspect" && !tp(lo(t), lo(n), 0.2);
}
function Xp(e) {
  return e !== e.root && e.scroll?.wasRoot;
}
const Zp = kc({
  attachResizeListener: (e, t) => Bs(e, "resize", t),
  measureScroll: () => ({
    x: document.documentElement.scrollLeft || document.body.scrollLeft,
    y: document.documentElement.scrollTop || document.body.scrollTop
  }),
  checkIsScrollRoot: () => !0
}), pr = {
  current: void 0
}, Pc = kc({
  measureScroll: (e) => ({
    x: e.scrollLeft,
    y: e.scrollTop
  }),
  defaultParent: () => {
    if (!pr.current) {
      const e = new Zp({});
      e.mount(window), e.setOptions({ layoutScroll: !0 }), pr.current = e;
    }
    return pr.current;
  },
  resetTransform: (e, t) => {
    e.style.transform = t !== void 0 ? t : "none";
  },
  checkIsScrollRoot: (e) => window.getComputedStyle(e).position === "fixed"
}), Qp = {
  pan: {
    Feature: xp
  },
  drag: {
    Feature: pp,
    ProjectionNode: Pc,
    MeasureLayout: yc
  }
};
function vo(e, t, n) {
  const { props: r } = e;
  e.animationState && r.whileHover && e.animationState.setActive("whileHover", n === "Start");
  const i = "onHover" + n, a = r[i];
  a && ye.postRender(() => a(t, Ks(t)));
}
class Jp extends It {
  mount() {
    const { current: t } = this.node;
    t && (this.unmount = jh(t, (n, r) => (vo(this.node, r, "Start"), (i) => vo(this.node, i, "End"))));
  }
  unmount() {
  }
}
class e0 extends It {
  constructor() {
    super(...arguments), this.isActive = !1;
  }
  onFocus() {
    let t = !1;
    try {
      t = this.node.current.matches(":focus-visible");
    } catch {
      t = !0;
    }
    !t || !this.node.animationState || (this.node.animationState.setActive("whileFocus", !0), this.isActive = !0);
  }
  onBlur() {
    !this.isActive || !this.node.animationState || (this.node.animationState.setActive("whileFocus", !1), this.isActive = !1);
  }
  mount() {
    this.unmount = Us(Bs(this.node.current, "focus", () => this.onFocus()), Bs(this.node.current, "blur", () => this.onBlur()));
  }
  unmount() {
  }
}
function yo(e, t, n) {
  const { props: r } = e;
  if (e.current instanceof HTMLButtonElement && e.current.disabled)
    return;
  e.animationState && r.whileTap && e.animationState.setActive("whileTap", n === "Start");
  const i = "onTap" + (n === "End" ? "" : n), a = r[i];
  a && ye.postRender(() => a(t, Ks(t)));
}
class t0 extends It {
  mount() {
    const { current: t } = this.node;
    t && (this.unmount = Sh(t, (n, r) => (yo(this.node, r, "Start"), (i, { success: a }) => yo(this.node, i, a ? "End" : "Cancel")), { useGlobalTarget: this.node.props.globalTapTarget }));
  }
  unmount() {
  }
}
const Qr = /* @__PURE__ */ new WeakMap(), xr = /* @__PURE__ */ new WeakMap(), s0 = (e) => {
  const t = Qr.get(e.target);
  t && t(e);
}, n0 = (e) => {
  e.forEach(s0);
};
function r0({ root: e, ...t }) {
  const n = e || document;
  xr.has(n) || xr.set(n, {});
  const r = xr.get(n), i = JSON.stringify(t);
  return r[i] || (r[i] = new IntersectionObserver(n0, { root: e, ...t })), r[i];
}
function i0(e, t, n) {
  const r = r0(t);
  return Qr.set(e, n), r.observe(e), () => {
    Qr.delete(e), r.unobserve(e);
  };
}
const a0 = {
  some: 0,
  all: 1
};
class o0 extends It {
  constructor() {
    super(...arguments), this.hasEnteredView = !1, this.isInView = !1;
  }
  startObserver() {
    this.unmount();
    const { viewport: t = {} } = this.node.getProps(), { root: n, margin: r, amount: i = "some", once: a } = t, o = {
      root: n ? n.current : void 0,
      rootMargin: r,
      threshold: typeof i == "number" ? i : a0[i]
    }, l = (c) => {
      const { isIntersecting: u } = c;
      if (this.isInView === u || (this.isInView = u, a && !u && this.hasEnteredView))
        return;
      u && (this.hasEnteredView = !0), this.node.animationState && this.node.animationState.setActive("whileInView", u);
      const { onViewportEnter: d, onViewportLeave: m } = this.node.getProps(), h = u ? d : m;
      h && h(c);
    };
    return i0(this.node.current, o, l);
  }
  mount() {
    this.startObserver();
  }
  update() {
    if (typeof IntersectionObserver > "u")
      return;
    const { props: t, prevProps: n } = this.node;
    ["amount", "margin", "root"].some(l0(t, n)) && this.startObserver();
  }
  unmount() {
  }
}
function l0({ viewport: e = {} }, { viewport: t = {} } = {}) {
  return (n) => e[n] !== t[n];
}
const c0 = {
  inView: {
    Feature: o0
  },
  tap: {
    Feature: t0
  },
  focus: {
    Feature: e0
  },
  hover: {
    Feature: Jp
  }
}, d0 = {
  layout: {
    ProjectionNode: Pc,
    MeasureLayout: yc
  }
}, u0 = {
  ...qf,
  ...c0,
  ...Qp,
  ...d0
}, D = /* @__PURE__ */ uf(u0, Cf);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const m0 = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), h0 = (e) => e.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (t, n, r) => r ? r.toUpperCase() : n.toLowerCase()
), jo = (e) => {
  const t = h0(e);
  return t.charAt(0).toUpperCase() + t.slice(1);
}, Ec = (...e) => e.filter((t, n, r) => !!t && t.trim() !== "" && r.indexOf(t) === n).join(" ").trim();
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
var f0 = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const p0 = di(
  ({
    color: e = "currentColor",
    size: t = 24,
    strokeWidth: n = 2,
    absoluteStrokeWidth: r,
    className: i = "",
    children: a,
    iconNode: o,
    ...l
  }, c) => Rn(
    "svg",
    {
      ref: c,
      ...f0,
      width: t,
      height: t,
      stroke: e,
      strokeWidth: r ? Number(n) * 24 / Number(t) : n,
      className: Ec("lucide", i),
      ...l
    },
    [
      ...o.map(([u, d]) => Rn(u, d)),
      ...Array.isArray(a) ? a : [a]
    ]
  )
);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const J = (e, t) => {
  const n = di(
    ({ className: r, ...i }, a) => Rn(p0, {
      ref: a,
      iconNode: t,
      className: Ec(
        `lucide-${m0(jo(e))}`,
        `lucide-${e}`,
        r
      ),
      ...i
    })
  );
  return n.displayName = jo(e), n;
};
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const x0 = [
  [
    "path",
    {
      d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
      key: "169zse"
    }
  ]
], gr = J("activity", x0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const g0 = [
  [
    "path",
    { d: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8", key: "mg9rjx" }
  ]
], b0 = J("bold", g0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const v0 = [
  [
    "path",
    {
      d: "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
      key: "l5xja"
    }
  ],
  [
    "path",
    {
      d: "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z",
      key: "ep3f8r"
    }
  ],
  ["path", { d: "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4", key: "1p4c4q" }],
  ["path", { d: "M17.599 6.5a3 3 0 0 0 .399-1.375", key: "tmeiqw" }],
  ["path", { d: "M6.003 5.125A3 3 0 0 0 6.401 6.5", key: "105sqy" }],
  ["path", { d: "M3.477 10.896a4 4 0 0 1 .585-.396", key: "ql3yin" }],
  ["path", { d: "M19.938 10.5a4 4 0 0 1 .585.396", key: "1qfode" }],
  ["path", { d: "M6 18a4 4 0 0 1-1.967-.516", key: "2e4loj" }],
  ["path", { d: "M19.967 17.484A4 4 0 0 1 18 18", key: "159ez6" }]
], Yt = J("brain", v0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const y0 = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]], _e = J("check", y0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const j0 = [["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }]], cn = J("chevron-left", j0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const w0 = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]], Lt = J("chevron-right", w0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const N0 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["line", { x1: "12", x2: "12", y1: "8", y2: "12", key: "1pkeuh" }],
  ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16", key: "4dfq90" }]
], br = J("circle-alert", N0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const C0 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", key: "1u773s" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
], Jr = J("circle-help", C0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const S0 = [["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }]], wo = J("circle", S0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const k0 = [
  ["polyline", { points: "16 18 22 12 16 6", key: "z7tu5w" }],
  ["polyline", { points: "8 6 2 12 8 18", key: "1eg1df" }]
], No = J("code", k0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const T0 = [
  [
    "path",
    {
      d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
      key: "ct8e1f"
    }
  ],
  ["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242", key: "151rxh" }],
  [
    "path",
    {
      d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
      key: "13bj9a"
    }
  ],
  ["path", { d: "m2 2 20 20", key: "1ooewy" }]
], P0 = J("eye-off", T0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const E0 = [
  [
    "path",
    {
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
      key: "1nclc0"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], jt = J("eye", E0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const A0 = [
  ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", key: "1rqfz7" }],
  ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4", key: "tnqrlb" }],
  ["path", { d: "M10 9H8", key: "b1mrlr" }],
  ["path", { d: "M16 13H8", key: "t4e002" }],
  ["path", { d: "M16 17H8", key: "z1uh3a" }]
], Os = J("file-text", A0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const R0 = [
  [
    "path",
    {
      d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
      key: "sc7q7i"
    }
  ]
], Co = J("funnel", R0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const M0 = [
  [
    "path",
    {
      d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
      key: "c3ymky"
    }
  ]
], I0 = J("heart", M0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const D0 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 16v-4", key: "1dtifu" }],
  ["path", { d: "M12 8h.01", key: "e9boi3" }]
], So = J("info", D0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const O0 = [
  ["line", { x1: "19", x2: "10", y1: "4", y2: "4", key: "15jd3p" }],
  ["line", { x1: "14", x2: "5", y1: "20", y2: "20", key: "bu0au3" }],
  ["line", { x1: "15", x2: "9", y1: "4", y2: "20", key: "uljnxc" }]
], V0 = J("italic", O0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const L0 = [
  [
    "path",
    {
      d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
      key: "1gvzjb"
    }
  ],
  ["path", { d: "M9 18h6", key: "x1upvd" }],
  ["path", { d: "M10 22h4", key: "ceow96" }]
], F0 = J("lightbulb", L0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const z0 = [
  ["path", { d: "M10 12h11", key: "6m4ad9" }],
  ["path", { d: "M10 18h11", key: "11hvi2" }],
  ["path", { d: "M10 6h11", key: "c7qv1k" }],
  ["path", { d: "M4 10h2", key: "16xx2s" }],
  ["path", { d: "M4 6h1v4", key: "cnovpq" }],
  ["path", { d: "M6 18H4c0-1 2-2 2-3s-1-1.5-2-1", key: "m9a95d" }]
], _0 = J("list-ordered", z0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const $0 = [
  ["path", { d: "M3 12h.01", key: "nlz23k" }],
  ["path", { d: "M3 18h.01", key: "1tta3j" }],
  ["path", { d: "M3 6h.01", key: "1rqtza" }],
  ["path", { d: "M8 12h13", key: "1za7za" }],
  ["path", { d: "M8 18h13", key: "1lx6n3" }],
  ["path", { d: "M8 6h13", key: "ik3vkj" }]
], B0 = J("list", $0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const W0 = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]], U0 = J("loader-circle", W0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const H0 = [
  ["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", key: "1lielz" }]
], Ac = J("message-square", H0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const G0 = [
  ["path", { d: "M12 20h9", key: "t2du7b" }],
  [
    "path",
    {
      d: "M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z",
      key: "1ykcvy"
    }
  ]
], ei = J("pen-line", G0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const K0 = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
], Jt = J("plus", K0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Y0 = [
  ["path", { d: "M21 7v6h-6", key: "3ptur4" }],
  ["path", { d: "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7", key: "1kgawr" }]
], q0 = J("redo", Y0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const X0 = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
], Z0 = J("refresh-cw", X0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Q0 = [
  [
    "path",
    {
      d: "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
      key: "1ffxy3"
    }
  ],
  ["path", { d: "m21.854 2.147-10.94 10.939", key: "12cjpa" }]
], J0 = J("send", Q0);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const ex = [
  [
    "path",
    {
      d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
      key: "1qme2f"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], Ln = J("settings", ex);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const tx = [
  [
    "path",
    {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      key: "oel41y"
    }
  ]
], dn = J("shield", tx);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const sx = [
  [
    "path",
    {
      d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
      key: "4pj2yx"
    }
  ],
  ["path", { d: "M20 3v4", key: "1olli1" }],
  ["path", { d: "M22 5h-4", key: "1gvqau" }],
  ["path", { d: "M4 17v2", key: "vumght" }],
  ["path", { d: "M5 18H3", key: "zchphs" }]
], Cs = J("sparkles", sx);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const nx = [
  ["path", { d: "M11 2v2", key: "1539x4" }],
  ["path", { d: "M5 2v2", key: "1yf1q8" }],
  ["path", { d: "M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1", key: "rb5t3r" }],
  ["path", { d: "M8 15a6 6 0 0 0 12 0v-3", key: "x18d4x" }],
  ["circle", { cx: "20", cy: "10", r: "2", key: "ts1r5v" }]
], un = J("stethoscope", nx);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const rx = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["circle", { cx: "12", cy: "12", r: "6", key: "1vlfrh" }],
  ["circle", { cx: "12", cy: "12", r: "2", key: "1c9p78" }]
], ix = J("target", rx);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const ax = [
  ["rect", { width: "20", height: "12", x: "2", y: "6", rx: "6", ry: "6", key: "f2vt7d" }],
  ["circle", { cx: "16", cy: "12", r: "2", key: "4ma0v8" }]
], ox = J("toggle-right", ax);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const lx = [
  ["polyline", { points: "22 7 13.5 15.5 8.5 10.5 2 17", key: "126l90" }],
  ["polyline", { points: "16 7 22 7 22 13", key: "kwv8wd" }]
], vr = J("trending-up", lx);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const cx = [
  [
    "path",
    {
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      key: "wmoenq"
    }
  ],
  ["path", { d: "M12 9v4", key: "juzpu7" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
], Rc = J("triangle-alert", cx);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const dx = [
  ["path", { d: "M6 4v6a6 6 0 0 0 12 0V4", key: "9kb039" }],
  ["line", { x1: "4", x2: "20", y1: "20", y2: "20", key: "nun2al" }]
], ux = J("underline", dx);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const mx = [
  ["path", { d: "M3 7v6h6", key: "1v2h90" }],
  ["path", { d: "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13", key: "1r6uu6" }]
], hx = J("undo", mx);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const fx = [
  ["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", key: "975kel" }],
  ["circle", { cx: "12", cy: "7", r: "4", key: "17ys0d" }]
], wt = J("user", fx);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const px = [
  ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
  ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }],
  ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87", key: "kshegd" }],
  ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75", key: "1da9ce" }]
], xx = J("users", px);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const gx = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
], Fn = J("x", gx);
/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const bx = [
  [
    "path",
    {
      d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
      key: "1xq2db"
    }
  ]
], mn = J("zap", bx);
function vx({ steps: e, currentStep: t, onStepClick: n }) {
  return /* @__PURE__ */ s.jsx("div", { className: "bg-white/95 backdrop-blur-lg border-b border-slate-200/50 shadow-sm", children: /* @__PURE__ */ s.jsx("div", { className: "w-full px-12 py-8 flex items-center justify-center min-h-0", children: /* @__PURE__ */ s.jsxs(
    D.div,
    {
      initial: { opacity: 0, y: -15 },
      animate: { opacity: 1, y: 0 },
      className: "flex items-center gap-16 w-full",
      children: [
        /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4 flex-shrink-0", children: [
          /* @__PURE__ */ s.jsx("div", { className: "w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg", children: /* @__PURE__ */ s.jsx(
            D.div,
            {
              animate: { rotate: [0, 360] },
              transition: { duration: 20, repeat: 1 / 0, ease: "linear" },
              children: /* @__PURE__ */ s.jsx(Ln, { size: 26, className: "text-white" })
            }
          ) }),
          /* @__PURE__ */ s.jsxs("div", { children: [
            /* @__PURE__ */ s.jsx("h1", { className: "text-2xl font-bold bg-gradient-to-r from-slate-800 to-blue-700 bg-clip-text text-transparent", children: "Finalization Wizard" }),
            /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mt-1", children: "AI-powered documentation refinement and clinical decision support" })
          ] })
        ] }),
        /* @__PURE__ */ s.jsxs("div", { className: "relative flex-1 min-w-0", style: { height: "80px" }, children: [
          /* @__PURE__ */ s.jsx("div", { className: "absolute top-1/2 -translate-y-1/2 w-full px-8 flex justify-between items-center z-10", children: e.map((r, i) => {
            const a = r.id < t, o = r.id === t;
            return r.id === 1 || r.id, r.id, /* @__PURE__ */ s.jsxs(
              D.div,
              {
                className: "flex flex-col items-center relative",
                initial: { opacity: 0, y: 15 },
                animate: { opacity: 1, y: 0 },
                transition: { delay: i * 0.07 },
                children: [
                  /* @__PURE__ */ s.jsx(
                    D.button,
                    {
                      onClick: () => n(r.id),
                      className: `
                        w-12 h-12 rounded-full flex items-center justify-center cursor-pointer
                        transition-all duration-300 group relative
                        ${a ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg" : o ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl ring-2 ring-blue-300/50" : "bg-white border-2 border-slate-300 text-slate-600 hover:border-blue-400 hover:shadow-lg"}
                      `,
                      whileHover: { scale: 1.05 },
                      whileTap: { scale: 0.98 },
                      animate: o ? {
                        boxShadow: [
                          "0 6px 20px rgba(59, 130, 246, 0.25)",
                          "0 10px 30px rgba(59, 130, 246, 0.35)",
                          "0 6px 20px rgba(59, 130, 246, 0.25)"
                        ]
                      } : {},
                      transition: { duration: 2, repeat: o ? 1 / 0 : 0, ease: "easeInOut" },
                      children: a ? /* @__PURE__ */ s.jsx(
                        D.div,
                        {
                          initial: { scale: 0, rotate: -180 },
                          animate: { scale: 1, rotate: 0 },
                          transition: { duration: 0.4, type: "spring" },
                          children: /* @__PURE__ */ s.jsx(_e, { size: 16 })
                        }
                      ) : r.id === 0 ? /* @__PURE__ */ s.jsx(Ln, { size: 14 }) : /* @__PURE__ */ s.jsx(
                        D.span,
                        {
                          className: "font-semibold text-sm",
                          initial: { opacity: 0, scale: 0.5 },
                          animate: { opacity: 1, scale: 1 },
                          transition: { delay: i * 0.07 + 0.2 },
                          children: r.id
                        }
                      )
                    }
                  ),
                  /* @__PURE__ */ s.jsx(
                    D.div,
                    {
                      className: "absolute top-full mt-2 text-center left-1/2 -translate-x-1/2",
                      initial: { opacity: 0, y: 8 },
                      animate: { opacity: 1, y: 0 },
                      transition: { delay: i * 0.07 + 0.3 },
                      children: /* @__PURE__ */ s.jsx("div", { className: `text-sm font-medium transition-colors duration-300 whitespace-nowrap ${a ? "text-emerald-600" : o ? "text-blue-600" : "text-slate-600"}`, children: r.title })
                    }
                  )
                ]
              },
              r.id
            );
          }) }),
          /* @__PURE__ */ s.jsx("div", { className: "absolute top-1/2 -translate-y-0.5 w-full h-1 z-0", children: /* @__PURE__ */ s.jsx("div", { className: "relative h-full mx-8", children: /* @__PURE__ */ s.jsx("div", { className: "h-full bg-slate-200/80 rounded-full", children: /* @__PURE__ */ s.jsx(
            D.div,
            {
              className: "h-full bg-gradient-to-r from-blue-400/90 to-indigo-500/90 rounded-full relative overflow-hidden",
              initial: { width: "0%" },
              animate: {
                width: t === 1 ? "0%" : `${(t - 1) / (e.length - 1) * 100}%`
              },
              transition: { duration: 0.8, ease: "easeOut" },
              children: /* @__PURE__ */ s.jsx(
                D.div,
                {
                  className: "absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent",
                  animate: {
                    x: ["-100%", "100%"]
                  },
                  transition: {
                    duration: 2.5,
                    repeat: 1 / 0,
                    ease: "easeInOut"
                  }
                }
              )
            }
          ) }) }) })
        ] })
      ]
    }
  ) }) });
}
function ko(e, t) {
  if (typeof e == "function")
    return e(t);
  e != null && (e.current = t);
}
function Mc(...e) {
  return (t) => {
    let n = !1;
    const r = e.map((i) => {
      const a = ko(i, t);
      return !n && typeof a == "function" && (n = !0), a;
    });
    if (n)
      return () => {
        for (let i = 0; i < r.length; i++) {
          const a = r[i];
          typeof a == "function" ? a() : ko(e[i], null);
        }
      };
  };
}
function Ve(...e) {
  return p.useCallback(Mc(...e), e);
}
// @__NO_SIDE_EFFECTS__
function Ws(e) {
  const t = /* @__PURE__ */ yx(e), n = p.forwardRef((r, i) => {
    const { children: a, ...o } = r, l = p.Children.toArray(a), c = l.find(wx);
    if (c) {
      const u = c.props.children, d = l.map((m) => m === c ? p.Children.count(u) > 1 ? p.Children.only(null) : p.isValidElement(u) ? u.props.children : null : m);
      return /* @__PURE__ */ s.jsx(t, { ...o, ref: i, children: p.isValidElement(u) ? p.cloneElement(u, void 0, d) : null });
    }
    return /* @__PURE__ */ s.jsx(t, { ...o, ref: i, children: a });
  });
  return n.displayName = `${e}.Slot`, n;
}
var Ic = /* @__PURE__ */ Ws("Slot");
// @__NO_SIDE_EFFECTS__
function yx(e) {
  const t = p.forwardRef((n, r) => {
    const { children: i, ...a } = n;
    if (p.isValidElement(i)) {
      const o = Cx(i), l = Nx(a, i.props);
      return i.type !== p.Fragment && (l.ref = r ? Mc(r, o) : o), p.cloneElement(i, l);
    }
    return p.Children.count(i) > 1 ? p.Children.only(null) : null;
  });
  return t.displayName = `${e}.SlotClone`, t;
}
var jx = Symbol("radix.slottable");
function wx(e) {
  return p.isValidElement(e) && typeof e.type == "function" && "__radixId" in e.type && e.type.__radixId === jx;
}
function Nx(e, t) {
  const n = { ...t };
  for (const r in t) {
    const i = e[r], a = t[r];
    /^on[A-Z]/.test(r) ? i && a ? n[r] = (...l) => {
      const c = a(...l);
      return i(...l), c;
    } : i && (n[r] = i) : r === "style" ? n[r] = { ...i, ...a } : r === "className" && (n[r] = [i, a].filter(Boolean).join(" "));
  }
  return { ...e, ...n };
}
function Cx(e) {
  let t = Object.getOwnPropertyDescriptor(e.props, "ref")?.get, n = t && "isReactWarning" in t && t.isReactWarning;
  return n ? e.ref : (t = Object.getOwnPropertyDescriptor(e, "ref")?.get, n = t && "isReactWarning" in t && t.isReactWarning, n ? e.props.ref : e.props.ref || e.ref);
}
function Dc(e) {
  var t, n, r = "";
  if (typeof e == "string" || typeof e == "number") r += e;
  else if (typeof e == "object") if (Array.isArray(e)) {
    var i = e.length;
    for (t = 0; t < i; t++) e[t] && (n = Dc(e[t])) && (r && (r += " "), r += n);
  } else for (n in e) e[n] && (r && (r += " "), r += n);
  return r;
}
function Oc() {
  for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = Dc(e)) && (r && (r += " "), r += t);
  return r;
}
const To = (e) => typeof e == "boolean" ? `${e}` : e === 0 ? "0" : e, Po = Oc, Vc = (e, t) => (n) => {
  var r;
  if (t?.variants == null) return Po(e, n?.class, n?.className);
  const { variants: i, defaultVariants: a } = t, o = Object.keys(i).map((u) => {
    const d = n?.[u], m = a?.[u];
    if (d === null) return null;
    const h = To(d) || To(m);
    return i[u][h];
  }), l = n && Object.entries(n).reduce((u, d) => {
    let [m, h] = d;
    return h === void 0 || (u[m] = h), u;
  }, {}), c = t == null || (r = t.compoundVariants) === null || r === void 0 ? void 0 : r.reduce((u, d) => {
    let { class: m, className: h, ...f } = d;
    return Object.entries(f).every((v) => {
      let [g, N] = v;
      return Array.isArray(N) ? N.includes({
        ...a,
        ...l
      }[g]) : {
        ...a,
        ...l
      }[g] === N;
    }) ? [
      ...u,
      m,
      h
    ] : u;
  }, []);
  return Po(e, o, c, n?.class, n?.className);
}, Hi = "-", Sx = (e) => {
  const t = Tx(e), {
    conflictingClassGroups: n,
    conflictingClassGroupModifiers: r
  } = e;
  return {
    getClassGroupId: (o) => {
      const l = o.split(Hi);
      return l[0] === "" && l.length !== 1 && l.shift(), Lc(l, t) || kx(o);
    },
    getConflictingClassGroupIds: (o, l) => {
      const c = n[o] || [];
      return l && r[o] ? [...c, ...r[o]] : c;
    }
  };
}, Lc = (e, t) => {
  if (e.length === 0)
    return t.classGroupId;
  const n = e[0], r = t.nextPart.get(n), i = r ? Lc(e.slice(1), r) : void 0;
  if (i)
    return i;
  if (t.validators.length === 0)
    return;
  const a = e.join(Hi);
  return t.validators.find(({
    validator: o
  }) => o(a))?.classGroupId;
}, Eo = /^\[(.+)\]$/, kx = (e) => {
  if (Eo.test(e)) {
    const t = Eo.exec(e)[1], n = t?.substring(0, t.indexOf(":"));
    if (n)
      return "arbitrary.." + n;
  }
}, Tx = (e) => {
  const {
    theme: t,
    classGroups: n
  } = e, r = {
    nextPart: /* @__PURE__ */ new Map(),
    validators: []
  };
  for (const i in n)
    ti(n[i], r, i, t);
  return r;
}, ti = (e, t, n, r) => {
  e.forEach((i) => {
    if (typeof i == "string") {
      const a = i === "" ? t : Ao(t, i);
      a.classGroupId = n;
      return;
    }
    if (typeof i == "function") {
      if (Px(i)) {
        ti(i(r), t, n, r);
        return;
      }
      t.validators.push({
        validator: i,
        classGroupId: n
      });
      return;
    }
    Object.entries(i).forEach(([a, o]) => {
      ti(o, Ao(t, a), n, r);
    });
  });
}, Ao = (e, t) => {
  let n = e;
  return t.split(Hi).forEach((r) => {
    n.nextPart.has(r) || n.nextPart.set(r, {
      nextPart: /* @__PURE__ */ new Map(),
      validators: []
    }), n = n.nextPart.get(r);
  }), n;
}, Px = (e) => e.isThemeGetter, Ex = (e) => {
  if (e < 1)
    return {
      get: () => {
      },
      set: () => {
      }
    };
  let t = 0, n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map();
  const i = (a, o) => {
    n.set(a, o), t++, t > e && (t = 0, r = n, n = /* @__PURE__ */ new Map());
  };
  return {
    get(a) {
      let o = n.get(a);
      if (o !== void 0)
        return o;
      if ((o = r.get(a)) !== void 0)
        return i(a, o), o;
    },
    set(a, o) {
      n.has(a) ? n.set(a, o) : i(a, o);
    }
  };
}, si = "!", ni = ":", Ax = ni.length, Rx = (e) => {
  const {
    prefix: t,
    experimentalParseClassName: n
  } = e;
  let r = (i) => {
    const a = [];
    let o = 0, l = 0, c = 0, u;
    for (let v = 0; v < i.length; v++) {
      let g = i[v];
      if (o === 0 && l === 0) {
        if (g === ni) {
          a.push(i.slice(c, v)), c = v + Ax;
          continue;
        }
        if (g === "/") {
          u = v;
          continue;
        }
      }
      g === "[" ? o++ : g === "]" ? o-- : g === "(" ? l++ : g === ")" && l--;
    }
    const d = a.length === 0 ? i : i.substring(c), m = Mx(d), h = m !== d, f = u && u > c ? u - c : void 0;
    return {
      modifiers: a,
      hasImportantModifier: h,
      baseClassName: m,
      maybePostfixModifierPosition: f
    };
  };
  if (t) {
    const i = t + ni, a = r;
    r = (o) => o.startsWith(i) ? a(o.substring(i.length)) : {
      isExternal: !0,
      modifiers: [],
      hasImportantModifier: !1,
      baseClassName: o,
      maybePostfixModifierPosition: void 0
    };
  }
  if (n) {
    const i = r;
    r = (a) => n({
      className: a,
      parseClassName: i
    });
  }
  return r;
}, Mx = (e) => e.endsWith(si) ? e.substring(0, e.length - 1) : e.startsWith(si) ? e.substring(1) : e, Ix = (e) => {
  const t = Object.fromEntries(e.orderSensitiveModifiers.map((r) => [r, !0]));
  return (r) => {
    if (r.length <= 1)
      return r;
    const i = [];
    let a = [];
    return r.forEach((o) => {
      o[0] === "[" || t[o] ? (i.push(...a.sort(), o), a = []) : a.push(o);
    }), i.push(...a.sort()), i;
  };
}, Dx = (e) => ({
  cache: Ex(e.cacheSize),
  parseClassName: Rx(e),
  sortModifiers: Ix(e),
  ...Sx(e)
}), Ox = /\s+/, Vx = (e, t) => {
  const {
    parseClassName: n,
    getClassGroupId: r,
    getConflictingClassGroupIds: i,
    sortModifiers: a
  } = t, o = [], l = e.trim().split(Ox);
  let c = "";
  for (let u = l.length - 1; u >= 0; u -= 1) {
    const d = l[u], {
      isExternal: m,
      modifiers: h,
      hasImportantModifier: f,
      baseClassName: v,
      maybePostfixModifierPosition: g
    } = n(d);
    if (m) {
      c = d + (c.length > 0 ? " " + c : c);
      continue;
    }
    let N = !!g, j = r(N ? v.substring(0, g) : v);
    if (!j) {
      if (!N) {
        c = d + (c.length > 0 ? " " + c : c);
        continue;
      }
      if (j = r(v), !j) {
        c = d + (c.length > 0 ? " " + c : c);
        continue;
      }
      N = !1;
    }
    const b = a(h).join(":"), y = f ? b + si : b, S = y + j;
    if (o.includes(S))
      continue;
    o.push(S);
    const T = i(j, N);
    for (let E = 0; E < T.length; ++E) {
      const A = T[E];
      o.push(y + A);
    }
    c = d + (c.length > 0 ? " " + c : c);
  }
  return c;
};
function Lx() {
  let e = 0, t, n, r = "";
  for (; e < arguments.length; )
    (t = arguments[e++]) && (n = Fc(t)) && (r && (r += " "), r += n);
  return r;
}
const Fc = (e) => {
  if (typeof e == "string")
    return e;
  let t, n = "";
  for (let r = 0; r < e.length; r++)
    e[r] && (t = Fc(e[r])) && (n && (n += " "), n += t);
  return n;
};
function Fx(e, ...t) {
  let n, r, i, a = o;
  function o(c) {
    const u = t.reduce((d, m) => m(d), e());
    return n = Dx(u), r = n.cache.get, i = n.cache.set, a = l, l(c);
  }
  function l(c) {
    const u = r(c);
    if (u)
      return u;
    const d = Vx(c, n);
    return i(c, d), d;
  }
  return function() {
    return a(Lx.apply(null, arguments));
  };
}
const Oe = (e) => {
  const t = (n) => n[e] || [];
  return t.isThemeGetter = !0, t;
}, zc = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, _c = /^\((?:(\w[\w-]*):)?(.+)\)$/i, zx = /^\d+\/\d+$/, _x = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, $x = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, Bx = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, Wx = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, Ux = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, qt = (e) => zx.test(e), te = (e) => !!e && !Number.isNaN(Number(e)), Tt = (e) => !!e && Number.isInteger(Number(e)), yr = (e) => e.endsWith("%") && te(e.slice(0, -1)), yt = (e) => _x.test(e), Hx = () => !0, Gx = (e) => (
  // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
  // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
  // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
  $x.test(e) && !Bx.test(e)
), $c = () => !1, Kx = (e) => Wx.test(e), Yx = (e) => Ux.test(e), qx = (e) => !z(e) && !_(e), Xx = (e) => xs(e, Uc, $c), z = (e) => zc.test(e), Ft = (e) => xs(e, Hc, Gx), jr = (e) => xs(e, tg, te), Ro = (e) => xs(e, Bc, $c), Zx = (e) => xs(e, Wc, Yx), hn = (e) => xs(e, Gc, Kx), _ = (e) => _c.test(e), Ss = (e) => gs(e, Hc), Qx = (e) => gs(e, sg), Mo = (e) => gs(e, Bc), Jx = (e) => gs(e, Uc), eg = (e) => gs(e, Wc), fn = (e) => gs(e, Gc, !0), xs = (e, t, n) => {
  const r = zc.exec(e);
  return r ? r[1] ? t(r[1]) : n(r[2]) : !1;
}, gs = (e, t, n = !1) => {
  const r = _c.exec(e);
  return r ? r[1] ? t(r[1]) : n : !1;
}, Bc = (e) => e === "position" || e === "percentage", Wc = (e) => e === "image" || e === "url", Uc = (e) => e === "length" || e === "size" || e === "bg-size", Hc = (e) => e === "length", tg = (e) => e === "number", sg = (e) => e === "family-name", Gc = (e) => e === "shadow", ng = () => {
  const e = Oe("color"), t = Oe("font"), n = Oe("text"), r = Oe("font-weight"), i = Oe("tracking"), a = Oe("leading"), o = Oe("breakpoint"), l = Oe("container"), c = Oe("spacing"), u = Oe("radius"), d = Oe("shadow"), m = Oe("inset-shadow"), h = Oe("text-shadow"), f = Oe("drop-shadow"), v = Oe("blur"), g = Oe("perspective"), N = Oe("aspect"), j = Oe("ease"), b = Oe("animate"), y = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"], S = () => [
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "top-left",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "left-top",
    "top-right",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "right-top",
    "bottom-right",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "right-bottom",
    "bottom-left",
    // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
    "left-bottom"
  ], T = () => [...S(), _, z], E = () => ["auto", "hidden", "clip", "visible", "scroll"], A = () => ["auto", "contain", "none"], k = () => [_, z, c], L = () => [qt, "full", "auto", ...k()], O = () => [Tt, "none", "subgrid", _, z], q = () => ["auto", {
    span: ["full", Tt, _, z]
  }, Tt, _, z], P = () => [Tt, "auto", _, z], be = () => ["auto", "min", "max", "fr", _, z], me = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"], pe = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"], de = () => ["auto", ...k()], re = () => [qt, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ...k()], w = () => [e, _, z], B = () => [...S(), Mo, Ro, {
    position: [_, z]
  }], W = () => ["no-repeat", {
    repeat: ["", "x", "y", "space", "round"]
  }], G = () => ["auto", "cover", "contain", Jx, Xx, {
    size: [_, z]
  }], xe = () => [yr, Ss, Ft], oe = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    "full",
    u,
    _,
    z
  ], ee = () => ["", te, Ss, Ft], Z = () => ["solid", "dashed", "dotted", "double"], we = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"], le = () => [te, yr, Mo, Ro], Le = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    v,
    _,
    z
  ], He = () => ["none", te, _, z], Ge = () => ["none", te, _, z], Qe = () => [te, _, z], tt = () => [qt, "full", ...k()];
  return {
    cacheSize: 500,
    theme: {
      animate: ["spin", "ping", "pulse", "bounce"],
      aspect: ["video"],
      blur: [yt],
      breakpoint: [yt],
      color: [Hx],
      container: [yt],
      "drop-shadow": [yt],
      ease: ["in", "out", "in-out"],
      font: [qx],
      "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
      "inset-shadow": [yt],
      leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
      perspective: ["dramatic", "near", "normal", "midrange", "distant", "none"],
      radius: [yt],
      shadow: [yt],
      spacing: ["px", te],
      text: [yt],
      "text-shadow": [yt],
      tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"]
    },
    classGroups: {
      // --------------
      // --- Layout ---
      // --------------
      /**
       * Aspect Ratio
       * @see https://tailwindcss.com/docs/aspect-ratio
       */
      aspect: [{
        aspect: ["auto", "square", qt, z, _, N]
      }],
      /**
       * Container
       * @see https://tailwindcss.com/docs/container
       * @deprecated since Tailwind CSS v4.0.0
       */
      container: ["container"],
      /**
       * Columns
       * @see https://tailwindcss.com/docs/columns
       */
      columns: [{
        columns: [te, z, _, l]
      }],
      /**
       * Break After
       * @see https://tailwindcss.com/docs/break-after
       */
      "break-after": [{
        "break-after": y()
      }],
      /**
       * Break Before
       * @see https://tailwindcss.com/docs/break-before
       */
      "break-before": [{
        "break-before": y()
      }],
      /**
       * Break Inside
       * @see https://tailwindcss.com/docs/break-inside
       */
      "break-inside": [{
        "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"]
      }],
      /**
       * Box Decoration Break
       * @see https://tailwindcss.com/docs/box-decoration-break
       */
      "box-decoration": [{
        "box-decoration": ["slice", "clone"]
      }],
      /**
       * Box Sizing
       * @see https://tailwindcss.com/docs/box-sizing
       */
      box: [{
        box: ["border", "content"]
      }],
      /**
       * Display
       * @see https://tailwindcss.com/docs/display
       */
      display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"],
      /**
       * Screen Reader Only
       * @see https://tailwindcss.com/docs/display#screen-reader-only
       */
      sr: ["sr-only", "not-sr-only"],
      /**
       * Floats
       * @see https://tailwindcss.com/docs/float
       */
      float: [{
        float: ["right", "left", "none", "start", "end"]
      }],
      /**
       * Clear
       * @see https://tailwindcss.com/docs/clear
       */
      clear: [{
        clear: ["left", "right", "both", "none", "start", "end"]
      }],
      /**
       * Isolation
       * @see https://tailwindcss.com/docs/isolation
       */
      isolation: ["isolate", "isolation-auto"],
      /**
       * Object Fit
       * @see https://tailwindcss.com/docs/object-fit
       */
      "object-fit": [{
        object: ["contain", "cover", "fill", "none", "scale-down"]
      }],
      /**
       * Object Position
       * @see https://tailwindcss.com/docs/object-position
       */
      "object-position": [{
        object: T()
      }],
      /**
       * Overflow
       * @see https://tailwindcss.com/docs/overflow
       */
      overflow: [{
        overflow: E()
      }],
      /**
       * Overflow X
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-x": [{
        "overflow-x": E()
      }],
      /**
       * Overflow Y
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-y": [{
        "overflow-y": E()
      }],
      /**
       * Overscroll Behavior
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      overscroll: [{
        overscroll: A()
      }],
      /**
       * Overscroll Behavior X
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-x": [{
        "overscroll-x": A()
      }],
      /**
       * Overscroll Behavior Y
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-y": [{
        "overscroll-y": A()
      }],
      /**
       * Position
       * @see https://tailwindcss.com/docs/position
       */
      position: ["static", "fixed", "absolute", "relative", "sticky"],
      /**
       * Top / Right / Bottom / Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      inset: [{
        inset: L()
      }],
      /**
       * Right / Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-x": [{
        "inset-x": L()
      }],
      /**
       * Top / Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-y": [{
        "inset-y": L()
      }],
      /**
       * Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      start: [{
        start: L()
      }],
      /**
       * End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      end: [{
        end: L()
      }],
      /**
       * Top
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      top: [{
        top: L()
      }],
      /**
       * Right
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      right: [{
        right: L()
      }],
      /**
       * Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      bottom: [{
        bottom: L()
      }],
      /**
       * Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      left: [{
        left: L()
      }],
      /**
       * Visibility
       * @see https://tailwindcss.com/docs/visibility
       */
      visibility: ["visible", "invisible", "collapse"],
      /**
       * Z-Index
       * @see https://tailwindcss.com/docs/z-index
       */
      z: [{
        z: [Tt, "auto", _, z]
      }],
      // ------------------------
      // --- Flexbox and Grid ---
      // ------------------------
      /**
       * Flex Basis
       * @see https://tailwindcss.com/docs/flex-basis
       */
      basis: [{
        basis: [qt, "full", "auto", l, ...k()]
      }],
      /**
       * Flex Direction
       * @see https://tailwindcss.com/docs/flex-direction
       */
      "flex-direction": [{
        flex: ["row", "row-reverse", "col", "col-reverse"]
      }],
      /**
       * Flex Wrap
       * @see https://tailwindcss.com/docs/flex-wrap
       */
      "flex-wrap": [{
        flex: ["nowrap", "wrap", "wrap-reverse"]
      }],
      /**
       * Flex
       * @see https://tailwindcss.com/docs/flex
       */
      flex: [{
        flex: [te, qt, "auto", "initial", "none", z]
      }],
      /**
       * Flex Grow
       * @see https://tailwindcss.com/docs/flex-grow
       */
      grow: [{
        grow: ["", te, _, z]
      }],
      /**
       * Flex Shrink
       * @see https://tailwindcss.com/docs/flex-shrink
       */
      shrink: [{
        shrink: ["", te, _, z]
      }],
      /**
       * Order
       * @see https://tailwindcss.com/docs/order
       */
      order: [{
        order: [Tt, "first", "last", "none", _, z]
      }],
      /**
       * Grid Template Columns
       * @see https://tailwindcss.com/docs/grid-template-columns
       */
      "grid-cols": [{
        "grid-cols": O()
      }],
      /**
       * Grid Column Start / End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start-end": [{
        col: q()
      }],
      /**
       * Grid Column Start
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start": [{
        "col-start": P()
      }],
      /**
       * Grid Column End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-end": [{
        "col-end": P()
      }],
      /**
       * Grid Template Rows
       * @see https://tailwindcss.com/docs/grid-template-rows
       */
      "grid-rows": [{
        "grid-rows": O()
      }],
      /**
       * Grid Row Start / End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start-end": [{
        row: q()
      }],
      /**
       * Grid Row Start
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start": [{
        "row-start": P()
      }],
      /**
       * Grid Row End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-end": [{
        "row-end": P()
      }],
      /**
       * Grid Auto Flow
       * @see https://tailwindcss.com/docs/grid-auto-flow
       */
      "grid-flow": [{
        "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"]
      }],
      /**
       * Grid Auto Columns
       * @see https://tailwindcss.com/docs/grid-auto-columns
       */
      "auto-cols": [{
        "auto-cols": be()
      }],
      /**
       * Grid Auto Rows
       * @see https://tailwindcss.com/docs/grid-auto-rows
       */
      "auto-rows": [{
        "auto-rows": be()
      }],
      /**
       * Gap
       * @see https://tailwindcss.com/docs/gap
       */
      gap: [{
        gap: k()
      }],
      /**
       * Gap X
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-x": [{
        "gap-x": k()
      }],
      /**
       * Gap Y
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-y": [{
        "gap-y": k()
      }],
      /**
       * Justify Content
       * @see https://tailwindcss.com/docs/justify-content
       */
      "justify-content": [{
        justify: [...me(), "normal"]
      }],
      /**
       * Justify Items
       * @see https://tailwindcss.com/docs/justify-items
       */
      "justify-items": [{
        "justify-items": [...pe(), "normal"]
      }],
      /**
       * Justify Self
       * @see https://tailwindcss.com/docs/justify-self
       */
      "justify-self": [{
        "justify-self": ["auto", ...pe()]
      }],
      /**
       * Align Content
       * @see https://tailwindcss.com/docs/align-content
       */
      "align-content": [{
        content: ["normal", ...me()]
      }],
      /**
       * Align Items
       * @see https://tailwindcss.com/docs/align-items
       */
      "align-items": [{
        items: [...pe(), {
          baseline: ["", "last"]
        }]
      }],
      /**
       * Align Self
       * @see https://tailwindcss.com/docs/align-self
       */
      "align-self": [{
        self: ["auto", ...pe(), {
          baseline: ["", "last"]
        }]
      }],
      /**
       * Place Content
       * @see https://tailwindcss.com/docs/place-content
       */
      "place-content": [{
        "place-content": me()
      }],
      /**
       * Place Items
       * @see https://tailwindcss.com/docs/place-items
       */
      "place-items": [{
        "place-items": [...pe(), "baseline"]
      }],
      /**
       * Place Self
       * @see https://tailwindcss.com/docs/place-self
       */
      "place-self": [{
        "place-self": ["auto", ...pe()]
      }],
      // Spacing
      /**
       * Padding
       * @see https://tailwindcss.com/docs/padding
       */
      p: [{
        p: k()
      }],
      /**
       * Padding X
       * @see https://tailwindcss.com/docs/padding
       */
      px: [{
        px: k()
      }],
      /**
       * Padding Y
       * @see https://tailwindcss.com/docs/padding
       */
      py: [{
        py: k()
      }],
      /**
       * Padding Start
       * @see https://tailwindcss.com/docs/padding
       */
      ps: [{
        ps: k()
      }],
      /**
       * Padding End
       * @see https://tailwindcss.com/docs/padding
       */
      pe: [{
        pe: k()
      }],
      /**
       * Padding Top
       * @see https://tailwindcss.com/docs/padding
       */
      pt: [{
        pt: k()
      }],
      /**
       * Padding Right
       * @see https://tailwindcss.com/docs/padding
       */
      pr: [{
        pr: k()
      }],
      /**
       * Padding Bottom
       * @see https://tailwindcss.com/docs/padding
       */
      pb: [{
        pb: k()
      }],
      /**
       * Padding Left
       * @see https://tailwindcss.com/docs/padding
       */
      pl: [{
        pl: k()
      }],
      /**
       * Margin
       * @see https://tailwindcss.com/docs/margin
       */
      m: [{
        m: de()
      }],
      /**
       * Margin X
       * @see https://tailwindcss.com/docs/margin
       */
      mx: [{
        mx: de()
      }],
      /**
       * Margin Y
       * @see https://tailwindcss.com/docs/margin
       */
      my: [{
        my: de()
      }],
      /**
       * Margin Start
       * @see https://tailwindcss.com/docs/margin
       */
      ms: [{
        ms: de()
      }],
      /**
       * Margin End
       * @see https://tailwindcss.com/docs/margin
       */
      me: [{
        me: de()
      }],
      /**
       * Margin Top
       * @see https://tailwindcss.com/docs/margin
       */
      mt: [{
        mt: de()
      }],
      /**
       * Margin Right
       * @see https://tailwindcss.com/docs/margin
       */
      mr: [{
        mr: de()
      }],
      /**
       * Margin Bottom
       * @see https://tailwindcss.com/docs/margin
       */
      mb: [{
        mb: de()
      }],
      /**
       * Margin Left
       * @see https://tailwindcss.com/docs/margin
       */
      ml: [{
        ml: de()
      }],
      /**
       * Space Between X
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-x": [{
        "space-x": k()
      }],
      /**
       * Space Between X Reverse
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-x-reverse": ["space-x-reverse"],
      /**
       * Space Between Y
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-y": [{
        "space-y": k()
      }],
      /**
       * Space Between Y Reverse
       * @see https://tailwindcss.com/docs/margin#adding-space-between-children
       */
      "space-y-reverse": ["space-y-reverse"],
      // --------------
      // --- Sizing ---
      // --------------
      /**
       * Size
       * @see https://tailwindcss.com/docs/width#setting-both-width-and-height
       */
      size: [{
        size: re()
      }],
      /**
       * Width
       * @see https://tailwindcss.com/docs/width
       */
      w: [{
        w: [l, "screen", ...re()]
      }],
      /**
       * Min-Width
       * @see https://tailwindcss.com/docs/min-width
       */
      "min-w": [{
        "min-w": [
          l,
          "screen",
          /** Deprecated. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          "none",
          ...re()
        ]
      }],
      /**
       * Max-Width
       * @see https://tailwindcss.com/docs/max-width
       */
      "max-w": [{
        "max-w": [
          l,
          "screen",
          "none",
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          "prose",
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          {
            screen: [o]
          },
          ...re()
        ]
      }],
      /**
       * Height
       * @see https://tailwindcss.com/docs/height
       */
      h: [{
        h: ["screen", "lh", ...re()]
      }],
      /**
       * Min-Height
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-h": [{
        "min-h": ["screen", "lh", "none", ...re()]
      }],
      /**
       * Max-Height
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-h": [{
        "max-h": ["screen", "lh", ...re()]
      }],
      // ------------------
      // --- Typography ---
      // ------------------
      /**
       * Font Size
       * @see https://tailwindcss.com/docs/font-size
       */
      "font-size": [{
        text: ["base", n, Ss, Ft]
      }],
      /**
       * Font Smoothing
       * @see https://tailwindcss.com/docs/font-smoothing
       */
      "font-smoothing": ["antialiased", "subpixel-antialiased"],
      /**
       * Font Style
       * @see https://tailwindcss.com/docs/font-style
       */
      "font-style": ["italic", "not-italic"],
      /**
       * Font Weight
       * @see https://tailwindcss.com/docs/font-weight
       */
      "font-weight": [{
        font: [r, _, jr]
      }],
      /**
       * Font Stretch
       * @see https://tailwindcss.com/docs/font-stretch
       */
      "font-stretch": [{
        "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", yr, z]
      }],
      /**
       * Font Family
       * @see https://tailwindcss.com/docs/font-family
       */
      "font-family": [{
        font: [Qx, z, t]
      }],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-normal": ["normal-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-ordinal": ["ordinal"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-slashed-zero": ["slashed-zero"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-figure": ["lining-nums", "oldstyle-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-spacing": ["proportional-nums", "tabular-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
      /**
       * Letter Spacing
       * @see https://tailwindcss.com/docs/letter-spacing
       */
      tracking: [{
        tracking: [i, _, z]
      }],
      /**
       * Line Clamp
       * @see https://tailwindcss.com/docs/line-clamp
       */
      "line-clamp": [{
        "line-clamp": [te, "none", _, jr]
      }],
      /**
       * Line Height
       * @see https://tailwindcss.com/docs/line-height
       */
      leading: [{
        leading: [
          /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
          a,
          ...k()
        ]
      }],
      /**
       * List Style Image
       * @see https://tailwindcss.com/docs/list-style-image
       */
      "list-image": [{
        "list-image": ["none", _, z]
      }],
      /**
       * List Style Position
       * @see https://tailwindcss.com/docs/list-style-position
       */
      "list-style-position": [{
        list: ["inside", "outside"]
      }],
      /**
       * List Style Type
       * @see https://tailwindcss.com/docs/list-style-type
       */
      "list-style-type": [{
        list: ["disc", "decimal", "none", _, z]
      }],
      /**
       * Text Alignment
       * @see https://tailwindcss.com/docs/text-align
       */
      "text-alignment": [{
        text: ["left", "center", "right", "justify", "start", "end"]
      }],
      /**
       * Placeholder Color
       * @deprecated since Tailwind CSS v3.0.0
       * @see https://v3.tailwindcss.com/docs/placeholder-color
       */
      "placeholder-color": [{
        placeholder: w()
      }],
      /**
       * Text Color
       * @see https://tailwindcss.com/docs/text-color
       */
      "text-color": [{
        text: w()
      }],
      /**
       * Text Decoration
       * @see https://tailwindcss.com/docs/text-decoration
       */
      "text-decoration": ["underline", "overline", "line-through", "no-underline"],
      /**
       * Text Decoration Style
       * @see https://tailwindcss.com/docs/text-decoration-style
       */
      "text-decoration-style": [{
        decoration: [...Z(), "wavy"]
      }],
      /**
       * Text Decoration Thickness
       * @see https://tailwindcss.com/docs/text-decoration-thickness
       */
      "text-decoration-thickness": [{
        decoration: [te, "from-font", "auto", _, Ft]
      }],
      /**
       * Text Decoration Color
       * @see https://tailwindcss.com/docs/text-decoration-color
       */
      "text-decoration-color": [{
        decoration: w()
      }],
      /**
       * Text Underline Offset
       * @see https://tailwindcss.com/docs/text-underline-offset
       */
      "underline-offset": [{
        "underline-offset": [te, "auto", _, z]
      }],
      /**
       * Text Transform
       * @see https://tailwindcss.com/docs/text-transform
       */
      "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"],
      /**
       * Text Overflow
       * @see https://tailwindcss.com/docs/text-overflow
       */
      "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
      /**
       * Text Wrap
       * @see https://tailwindcss.com/docs/text-wrap
       */
      "text-wrap": [{
        text: ["wrap", "nowrap", "balance", "pretty"]
      }],
      /**
       * Text Indent
       * @see https://tailwindcss.com/docs/text-indent
       */
      indent: [{
        indent: k()
      }],
      /**
       * Vertical Alignment
       * @see https://tailwindcss.com/docs/vertical-align
       */
      "vertical-align": [{
        align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", _, z]
      }],
      /**
       * Whitespace
       * @see https://tailwindcss.com/docs/whitespace
       */
      whitespace: [{
        whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"]
      }],
      /**
       * Word Break
       * @see https://tailwindcss.com/docs/word-break
       */
      break: [{
        break: ["normal", "words", "all", "keep"]
      }],
      /**
       * Overflow Wrap
       * @see https://tailwindcss.com/docs/overflow-wrap
       */
      wrap: [{
        wrap: ["break-word", "anywhere", "normal"]
      }],
      /**
       * Hyphens
       * @see https://tailwindcss.com/docs/hyphens
       */
      hyphens: [{
        hyphens: ["none", "manual", "auto"]
      }],
      /**
       * Content
       * @see https://tailwindcss.com/docs/content
       */
      content: [{
        content: ["none", _, z]
      }],
      // -------------------
      // --- Backgrounds ---
      // -------------------
      /**
       * Background Attachment
       * @see https://tailwindcss.com/docs/background-attachment
       */
      "bg-attachment": [{
        bg: ["fixed", "local", "scroll"]
      }],
      /**
       * Background Clip
       * @see https://tailwindcss.com/docs/background-clip
       */
      "bg-clip": [{
        "bg-clip": ["border", "padding", "content", "text"]
      }],
      /**
       * Background Origin
       * @see https://tailwindcss.com/docs/background-origin
       */
      "bg-origin": [{
        "bg-origin": ["border", "padding", "content"]
      }],
      /**
       * Background Position
       * @see https://tailwindcss.com/docs/background-position
       */
      "bg-position": [{
        bg: B()
      }],
      /**
       * Background Repeat
       * @see https://tailwindcss.com/docs/background-repeat
       */
      "bg-repeat": [{
        bg: W()
      }],
      /**
       * Background Size
       * @see https://tailwindcss.com/docs/background-size
       */
      "bg-size": [{
        bg: G()
      }],
      /**
       * Background Image
       * @see https://tailwindcss.com/docs/background-image
       */
      "bg-image": [{
        bg: ["none", {
          linear: [{
            to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
          }, Tt, _, z],
          radial: ["", _, z],
          conic: [Tt, _, z]
        }, eg, Zx]
      }],
      /**
       * Background Color
       * @see https://tailwindcss.com/docs/background-color
       */
      "bg-color": [{
        bg: w()
      }],
      /**
       * Gradient Color Stops From Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-from-pos": [{
        from: xe()
      }],
      /**
       * Gradient Color Stops Via Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via-pos": [{
        via: xe()
      }],
      /**
       * Gradient Color Stops To Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to-pos": [{
        to: xe()
      }],
      /**
       * Gradient Color Stops From
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-from": [{
        from: w()
      }],
      /**
       * Gradient Color Stops Via
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via": [{
        via: w()
      }],
      /**
       * Gradient Color Stops To
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to": [{
        to: w()
      }],
      // ---------------
      // --- Borders ---
      // ---------------
      /**
       * Border Radius
       * @see https://tailwindcss.com/docs/border-radius
       */
      rounded: [{
        rounded: oe()
      }],
      /**
       * Border Radius Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-s": [{
        "rounded-s": oe()
      }],
      /**
       * Border Radius End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-e": [{
        "rounded-e": oe()
      }],
      /**
       * Border Radius Top
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-t": [{
        "rounded-t": oe()
      }],
      /**
       * Border Radius Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-r": [{
        "rounded-r": oe()
      }],
      /**
       * Border Radius Bottom
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-b": [{
        "rounded-b": oe()
      }],
      /**
       * Border Radius Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-l": [{
        "rounded-l": oe()
      }],
      /**
       * Border Radius Start Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ss": [{
        "rounded-ss": oe()
      }],
      /**
       * Border Radius Start End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-se": [{
        "rounded-se": oe()
      }],
      /**
       * Border Radius End End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ee": [{
        "rounded-ee": oe()
      }],
      /**
       * Border Radius End Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-es": [{
        "rounded-es": oe()
      }],
      /**
       * Border Radius Top Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tl": [{
        "rounded-tl": oe()
      }],
      /**
       * Border Radius Top Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tr": [{
        "rounded-tr": oe()
      }],
      /**
       * Border Radius Bottom Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-br": [{
        "rounded-br": oe()
      }],
      /**
       * Border Radius Bottom Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-bl": [{
        "rounded-bl": oe()
      }],
      /**
       * Border Width
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w": [{
        border: ee()
      }],
      /**
       * Border Width X
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-x": [{
        "border-x": ee()
      }],
      /**
       * Border Width Y
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-y": [{
        "border-y": ee()
      }],
      /**
       * Border Width Start
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-s": [{
        "border-s": ee()
      }],
      /**
       * Border Width End
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-e": [{
        "border-e": ee()
      }],
      /**
       * Border Width Top
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-t": [{
        "border-t": ee()
      }],
      /**
       * Border Width Right
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-r": [{
        "border-r": ee()
      }],
      /**
       * Border Width Bottom
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-b": [{
        "border-b": ee()
      }],
      /**
       * Border Width Left
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-l": [{
        "border-l": ee()
      }],
      /**
       * Divide Width X
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-x": [{
        "divide-x": ee()
      }],
      /**
       * Divide Width X Reverse
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-x-reverse": ["divide-x-reverse"],
      /**
       * Divide Width Y
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-y": [{
        "divide-y": ee()
      }],
      /**
       * Divide Width Y Reverse
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-y-reverse": ["divide-y-reverse"],
      /**
       * Border Style
       * @see https://tailwindcss.com/docs/border-style
       */
      "border-style": [{
        border: [...Z(), "hidden", "none"]
      }],
      /**
       * Divide Style
       * @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
       */
      "divide-style": [{
        divide: [...Z(), "hidden", "none"]
      }],
      /**
       * Border Color
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color": [{
        border: w()
      }],
      /**
       * Border Color X
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-x": [{
        "border-x": w()
      }],
      /**
       * Border Color Y
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-y": [{
        "border-y": w()
      }],
      /**
       * Border Color S
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-s": [{
        "border-s": w()
      }],
      /**
       * Border Color E
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-e": [{
        "border-e": w()
      }],
      /**
       * Border Color Top
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-t": [{
        "border-t": w()
      }],
      /**
       * Border Color Right
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-r": [{
        "border-r": w()
      }],
      /**
       * Border Color Bottom
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-b": [{
        "border-b": w()
      }],
      /**
       * Border Color Left
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-l": [{
        "border-l": w()
      }],
      /**
       * Divide Color
       * @see https://tailwindcss.com/docs/divide-color
       */
      "divide-color": [{
        divide: w()
      }],
      /**
       * Outline Style
       * @see https://tailwindcss.com/docs/outline-style
       */
      "outline-style": [{
        outline: [...Z(), "none", "hidden"]
      }],
      /**
       * Outline Offset
       * @see https://tailwindcss.com/docs/outline-offset
       */
      "outline-offset": [{
        "outline-offset": [te, _, z]
      }],
      /**
       * Outline Width
       * @see https://tailwindcss.com/docs/outline-width
       */
      "outline-w": [{
        outline: ["", te, Ss, Ft]
      }],
      /**
       * Outline Color
       * @see https://tailwindcss.com/docs/outline-color
       */
      "outline-color": [{
        outline: w()
      }],
      // ---------------
      // --- Effects ---
      // ---------------
      /**
       * Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow
       */
      shadow: [{
        shadow: [
          // Deprecated since Tailwind CSS v4.0.0
          "",
          "none",
          d,
          fn,
          hn
        ]
      }],
      /**
       * Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-shadow-color
       */
      "shadow-color": [{
        shadow: w()
      }],
      /**
       * Inset Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
       */
      "inset-shadow": [{
        "inset-shadow": ["none", m, fn, hn]
      }],
      /**
       * Inset Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
       */
      "inset-shadow-color": [{
        "inset-shadow": w()
      }],
      /**
       * Ring Width
       * @see https://tailwindcss.com/docs/box-shadow#adding-a-ring
       */
      "ring-w": [{
        ring: ee()
      }],
      /**
       * Ring Width Inset
       * @see https://v3.tailwindcss.com/docs/ring-width#inset-rings
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-w-inset": ["ring-inset"],
      /**
       * Ring Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-ring-color
       */
      "ring-color": [{
        ring: w()
      }],
      /**
       * Ring Offset Width
       * @see https://v3.tailwindcss.com/docs/ring-offset-width
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-offset-w": [{
        "ring-offset": [te, Ft]
      }],
      /**
       * Ring Offset Color
       * @see https://v3.tailwindcss.com/docs/ring-offset-color
       * @deprecated since Tailwind CSS v4.0.0
       * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
       */
      "ring-offset-color": [{
        "ring-offset": w()
      }],
      /**
       * Inset Ring Width
       * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-ring
       */
      "inset-ring-w": [{
        "inset-ring": ee()
      }],
      /**
       * Inset Ring Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-ring-color
       */
      "inset-ring-color": [{
        "inset-ring": w()
      }],
      /**
       * Text Shadow
       * @see https://tailwindcss.com/docs/text-shadow
       */
      "text-shadow": [{
        "text-shadow": ["none", h, fn, hn]
      }],
      /**
       * Text Shadow Color
       * @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
       */
      "text-shadow-color": [{
        "text-shadow": w()
      }],
      /**
       * Opacity
       * @see https://tailwindcss.com/docs/opacity
       */
      opacity: [{
        opacity: [te, _, z]
      }],
      /**
       * Mix Blend Mode
       * @see https://tailwindcss.com/docs/mix-blend-mode
       */
      "mix-blend": [{
        "mix-blend": [...we(), "plus-darker", "plus-lighter"]
      }],
      /**
       * Background Blend Mode
       * @see https://tailwindcss.com/docs/background-blend-mode
       */
      "bg-blend": [{
        "bg-blend": we()
      }],
      /**
       * Mask Clip
       * @see https://tailwindcss.com/docs/mask-clip
       */
      "mask-clip": [{
        "mask-clip": ["border", "padding", "content", "fill", "stroke", "view"]
      }, "mask-no-clip"],
      /**
       * Mask Composite
       * @see https://tailwindcss.com/docs/mask-composite
       */
      "mask-composite": [{
        mask: ["add", "subtract", "intersect", "exclude"]
      }],
      /**
       * Mask Image
       * @see https://tailwindcss.com/docs/mask-image
       */
      "mask-image-linear-pos": [{
        "mask-linear": [te]
      }],
      "mask-image-linear-from-pos": [{
        "mask-linear-from": le()
      }],
      "mask-image-linear-to-pos": [{
        "mask-linear-to": le()
      }],
      "mask-image-linear-from-color": [{
        "mask-linear-from": w()
      }],
      "mask-image-linear-to-color": [{
        "mask-linear-to": w()
      }],
      "mask-image-t-from-pos": [{
        "mask-t-from": le()
      }],
      "mask-image-t-to-pos": [{
        "mask-t-to": le()
      }],
      "mask-image-t-from-color": [{
        "mask-t-from": w()
      }],
      "mask-image-t-to-color": [{
        "mask-t-to": w()
      }],
      "mask-image-r-from-pos": [{
        "mask-r-from": le()
      }],
      "mask-image-r-to-pos": [{
        "mask-r-to": le()
      }],
      "mask-image-r-from-color": [{
        "mask-r-from": w()
      }],
      "mask-image-r-to-color": [{
        "mask-r-to": w()
      }],
      "mask-image-b-from-pos": [{
        "mask-b-from": le()
      }],
      "mask-image-b-to-pos": [{
        "mask-b-to": le()
      }],
      "mask-image-b-from-color": [{
        "mask-b-from": w()
      }],
      "mask-image-b-to-color": [{
        "mask-b-to": w()
      }],
      "mask-image-l-from-pos": [{
        "mask-l-from": le()
      }],
      "mask-image-l-to-pos": [{
        "mask-l-to": le()
      }],
      "mask-image-l-from-color": [{
        "mask-l-from": w()
      }],
      "mask-image-l-to-color": [{
        "mask-l-to": w()
      }],
      "mask-image-x-from-pos": [{
        "mask-x-from": le()
      }],
      "mask-image-x-to-pos": [{
        "mask-x-to": le()
      }],
      "mask-image-x-from-color": [{
        "mask-x-from": w()
      }],
      "mask-image-x-to-color": [{
        "mask-x-to": w()
      }],
      "mask-image-y-from-pos": [{
        "mask-y-from": le()
      }],
      "mask-image-y-to-pos": [{
        "mask-y-to": le()
      }],
      "mask-image-y-from-color": [{
        "mask-y-from": w()
      }],
      "mask-image-y-to-color": [{
        "mask-y-to": w()
      }],
      "mask-image-radial": [{
        "mask-radial": [_, z]
      }],
      "mask-image-radial-from-pos": [{
        "mask-radial-from": le()
      }],
      "mask-image-radial-to-pos": [{
        "mask-radial-to": le()
      }],
      "mask-image-radial-from-color": [{
        "mask-radial-from": w()
      }],
      "mask-image-radial-to-color": [{
        "mask-radial-to": w()
      }],
      "mask-image-radial-shape": [{
        "mask-radial": ["circle", "ellipse"]
      }],
      "mask-image-radial-size": [{
        "mask-radial": [{
          closest: ["side", "corner"],
          farthest: ["side", "corner"]
        }]
      }],
      "mask-image-radial-pos": [{
        "mask-radial-at": S()
      }],
      "mask-image-conic-pos": [{
        "mask-conic": [te]
      }],
      "mask-image-conic-from-pos": [{
        "mask-conic-from": le()
      }],
      "mask-image-conic-to-pos": [{
        "mask-conic-to": le()
      }],
      "mask-image-conic-from-color": [{
        "mask-conic-from": w()
      }],
      "mask-image-conic-to-color": [{
        "mask-conic-to": w()
      }],
      /**
       * Mask Mode
       * @see https://tailwindcss.com/docs/mask-mode
       */
      "mask-mode": [{
        mask: ["alpha", "luminance", "match"]
      }],
      /**
       * Mask Origin
       * @see https://tailwindcss.com/docs/mask-origin
       */
      "mask-origin": [{
        "mask-origin": ["border", "padding", "content", "fill", "stroke", "view"]
      }],
      /**
       * Mask Position
       * @see https://tailwindcss.com/docs/mask-position
       */
      "mask-position": [{
        mask: B()
      }],
      /**
       * Mask Repeat
       * @see https://tailwindcss.com/docs/mask-repeat
       */
      "mask-repeat": [{
        mask: W()
      }],
      /**
       * Mask Size
       * @see https://tailwindcss.com/docs/mask-size
       */
      "mask-size": [{
        mask: G()
      }],
      /**
       * Mask Type
       * @see https://tailwindcss.com/docs/mask-type
       */
      "mask-type": [{
        "mask-type": ["alpha", "luminance"]
      }],
      /**
       * Mask Image
       * @see https://tailwindcss.com/docs/mask-image
       */
      "mask-image": [{
        mask: ["none", _, z]
      }],
      // ---------------
      // --- Filters ---
      // ---------------
      /**
       * Filter
       * @see https://tailwindcss.com/docs/filter
       */
      filter: [{
        filter: [
          // Deprecated since Tailwind CSS v3.0.0
          "",
          "none",
          _,
          z
        ]
      }],
      /**
       * Blur
       * @see https://tailwindcss.com/docs/blur
       */
      blur: [{
        blur: Le()
      }],
      /**
       * Brightness
       * @see https://tailwindcss.com/docs/brightness
       */
      brightness: [{
        brightness: [te, _, z]
      }],
      /**
       * Contrast
       * @see https://tailwindcss.com/docs/contrast
       */
      contrast: [{
        contrast: [te, _, z]
      }],
      /**
       * Drop Shadow
       * @see https://tailwindcss.com/docs/drop-shadow
       */
      "drop-shadow": [{
        "drop-shadow": [
          // Deprecated since Tailwind CSS v4.0.0
          "",
          "none",
          f,
          fn,
          hn
        ]
      }],
      /**
       * Drop Shadow Color
       * @see https://tailwindcss.com/docs/filter-drop-shadow#setting-the-shadow-color
       */
      "drop-shadow-color": [{
        "drop-shadow": w()
      }],
      /**
       * Grayscale
       * @see https://tailwindcss.com/docs/grayscale
       */
      grayscale: [{
        grayscale: ["", te, _, z]
      }],
      /**
       * Hue Rotate
       * @see https://tailwindcss.com/docs/hue-rotate
       */
      "hue-rotate": [{
        "hue-rotate": [te, _, z]
      }],
      /**
       * Invert
       * @see https://tailwindcss.com/docs/invert
       */
      invert: [{
        invert: ["", te, _, z]
      }],
      /**
       * Saturate
       * @see https://tailwindcss.com/docs/saturate
       */
      saturate: [{
        saturate: [te, _, z]
      }],
      /**
       * Sepia
       * @see https://tailwindcss.com/docs/sepia
       */
      sepia: [{
        sepia: ["", te, _, z]
      }],
      /**
       * Backdrop Filter
       * @see https://tailwindcss.com/docs/backdrop-filter
       */
      "backdrop-filter": [{
        "backdrop-filter": [
          // Deprecated since Tailwind CSS v3.0.0
          "",
          "none",
          _,
          z
        ]
      }],
      /**
       * Backdrop Blur
       * @see https://tailwindcss.com/docs/backdrop-blur
       */
      "backdrop-blur": [{
        "backdrop-blur": Le()
      }],
      /**
       * Backdrop Brightness
       * @see https://tailwindcss.com/docs/backdrop-brightness
       */
      "backdrop-brightness": [{
        "backdrop-brightness": [te, _, z]
      }],
      /**
       * Backdrop Contrast
       * @see https://tailwindcss.com/docs/backdrop-contrast
       */
      "backdrop-contrast": [{
        "backdrop-contrast": [te, _, z]
      }],
      /**
       * Backdrop Grayscale
       * @see https://tailwindcss.com/docs/backdrop-grayscale
       */
      "backdrop-grayscale": [{
        "backdrop-grayscale": ["", te, _, z]
      }],
      /**
       * Backdrop Hue Rotate
       * @see https://tailwindcss.com/docs/backdrop-hue-rotate
       */
      "backdrop-hue-rotate": [{
        "backdrop-hue-rotate": [te, _, z]
      }],
      /**
       * Backdrop Invert
       * @see https://tailwindcss.com/docs/backdrop-invert
       */
      "backdrop-invert": [{
        "backdrop-invert": ["", te, _, z]
      }],
      /**
       * Backdrop Opacity
       * @see https://tailwindcss.com/docs/backdrop-opacity
       */
      "backdrop-opacity": [{
        "backdrop-opacity": [te, _, z]
      }],
      /**
       * Backdrop Saturate
       * @see https://tailwindcss.com/docs/backdrop-saturate
       */
      "backdrop-saturate": [{
        "backdrop-saturate": [te, _, z]
      }],
      /**
       * Backdrop Sepia
       * @see https://tailwindcss.com/docs/backdrop-sepia
       */
      "backdrop-sepia": [{
        "backdrop-sepia": ["", te, _, z]
      }],
      // --------------
      // --- Tables ---
      // --------------
      /**
       * Border Collapse
       * @see https://tailwindcss.com/docs/border-collapse
       */
      "border-collapse": [{
        border: ["collapse", "separate"]
      }],
      /**
       * Border Spacing
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing": [{
        "border-spacing": k()
      }],
      /**
       * Border Spacing X
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-x": [{
        "border-spacing-x": k()
      }],
      /**
       * Border Spacing Y
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-y": [{
        "border-spacing-y": k()
      }],
      /**
       * Table Layout
       * @see https://tailwindcss.com/docs/table-layout
       */
      "table-layout": [{
        table: ["auto", "fixed"]
      }],
      /**
       * Caption Side
       * @see https://tailwindcss.com/docs/caption-side
       */
      caption: [{
        caption: ["top", "bottom"]
      }],
      // ---------------------------------
      // --- Transitions and Animation ---
      // ---------------------------------
      /**
       * Transition Property
       * @see https://tailwindcss.com/docs/transition-property
       */
      transition: [{
        transition: ["", "all", "colors", "opacity", "shadow", "transform", "none", _, z]
      }],
      /**
       * Transition Behavior
       * @see https://tailwindcss.com/docs/transition-behavior
       */
      "transition-behavior": [{
        transition: ["normal", "discrete"]
      }],
      /**
       * Transition Duration
       * @see https://tailwindcss.com/docs/transition-duration
       */
      duration: [{
        duration: [te, "initial", _, z]
      }],
      /**
       * Transition Timing Function
       * @see https://tailwindcss.com/docs/transition-timing-function
       */
      ease: [{
        ease: ["linear", "initial", j, _, z]
      }],
      /**
       * Transition Delay
       * @see https://tailwindcss.com/docs/transition-delay
       */
      delay: [{
        delay: [te, _, z]
      }],
      /**
       * Animation
       * @see https://tailwindcss.com/docs/animation
       */
      animate: [{
        animate: ["none", b, _, z]
      }],
      // ------------------
      // --- Transforms ---
      // ------------------
      /**
       * Backface Visibility
       * @see https://tailwindcss.com/docs/backface-visibility
       */
      backface: [{
        backface: ["hidden", "visible"]
      }],
      /**
       * Perspective
       * @see https://tailwindcss.com/docs/perspective
       */
      perspective: [{
        perspective: [g, _, z]
      }],
      /**
       * Perspective Origin
       * @see https://tailwindcss.com/docs/perspective-origin
       */
      "perspective-origin": [{
        "perspective-origin": T()
      }],
      /**
       * Rotate
       * @see https://tailwindcss.com/docs/rotate
       */
      rotate: [{
        rotate: He()
      }],
      /**
       * Rotate X
       * @see https://tailwindcss.com/docs/rotate
       */
      "rotate-x": [{
        "rotate-x": He()
      }],
      /**
       * Rotate Y
       * @see https://tailwindcss.com/docs/rotate
       */
      "rotate-y": [{
        "rotate-y": He()
      }],
      /**
       * Rotate Z
       * @see https://tailwindcss.com/docs/rotate
       */
      "rotate-z": [{
        "rotate-z": He()
      }],
      /**
       * Scale
       * @see https://tailwindcss.com/docs/scale
       */
      scale: [{
        scale: Ge()
      }],
      /**
       * Scale X
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-x": [{
        "scale-x": Ge()
      }],
      /**
       * Scale Y
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-y": [{
        "scale-y": Ge()
      }],
      /**
       * Scale Z
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-z": [{
        "scale-z": Ge()
      }],
      /**
       * Scale 3D
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-3d": ["scale-3d"],
      /**
       * Skew
       * @see https://tailwindcss.com/docs/skew
       */
      skew: [{
        skew: Qe()
      }],
      /**
       * Skew X
       * @see https://tailwindcss.com/docs/skew
       */
      "skew-x": [{
        "skew-x": Qe()
      }],
      /**
       * Skew Y
       * @see https://tailwindcss.com/docs/skew
       */
      "skew-y": [{
        "skew-y": Qe()
      }],
      /**
       * Transform
       * @see https://tailwindcss.com/docs/transform
       */
      transform: [{
        transform: [_, z, "", "none", "gpu", "cpu"]
      }],
      /**
       * Transform Origin
       * @see https://tailwindcss.com/docs/transform-origin
       */
      "transform-origin": [{
        origin: T()
      }],
      /**
       * Transform Style
       * @see https://tailwindcss.com/docs/transform-style
       */
      "transform-style": [{
        transform: ["3d", "flat"]
      }],
      /**
       * Translate
       * @see https://tailwindcss.com/docs/translate
       */
      translate: [{
        translate: tt()
      }],
      /**
       * Translate X
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-x": [{
        "translate-x": tt()
      }],
      /**
       * Translate Y
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-y": [{
        "translate-y": tt()
      }],
      /**
       * Translate Z
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-z": [{
        "translate-z": tt()
      }],
      /**
       * Translate None
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-none": ["translate-none"],
      // ---------------------
      // --- Interactivity ---
      // ---------------------
      /**
       * Accent Color
       * @see https://tailwindcss.com/docs/accent-color
       */
      accent: [{
        accent: w()
      }],
      /**
       * Appearance
       * @see https://tailwindcss.com/docs/appearance
       */
      appearance: [{
        appearance: ["none", "auto"]
      }],
      /**
       * Caret Color
       * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
       */
      "caret-color": [{
        caret: w()
      }],
      /**
       * Color Scheme
       * @see https://tailwindcss.com/docs/color-scheme
       */
      "color-scheme": [{
        scheme: ["normal", "dark", "light", "light-dark", "only-dark", "only-light"]
      }],
      /**
       * Cursor
       * @see https://tailwindcss.com/docs/cursor
       */
      cursor: [{
        cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", _, z]
      }],
      /**
       * Field Sizing
       * @see https://tailwindcss.com/docs/field-sizing
       */
      "field-sizing": [{
        "field-sizing": ["fixed", "content"]
      }],
      /**
       * Pointer Events
       * @see https://tailwindcss.com/docs/pointer-events
       */
      "pointer-events": [{
        "pointer-events": ["auto", "none"]
      }],
      /**
       * Resize
       * @see https://tailwindcss.com/docs/resize
       */
      resize: [{
        resize: ["none", "", "y", "x"]
      }],
      /**
       * Scroll Behavior
       * @see https://tailwindcss.com/docs/scroll-behavior
       */
      "scroll-behavior": [{
        scroll: ["auto", "smooth"]
      }],
      /**
       * Scroll Margin
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-m": [{
        "scroll-m": k()
      }],
      /**
       * Scroll Margin X
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mx": [{
        "scroll-mx": k()
      }],
      /**
       * Scroll Margin Y
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-my": [{
        "scroll-my": k()
      }],
      /**
       * Scroll Margin Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ms": [{
        "scroll-ms": k()
      }],
      /**
       * Scroll Margin End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-me": [{
        "scroll-me": k()
      }],
      /**
       * Scroll Margin Top
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mt": [{
        "scroll-mt": k()
      }],
      /**
       * Scroll Margin Right
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mr": [{
        "scroll-mr": k()
      }],
      /**
       * Scroll Margin Bottom
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mb": [{
        "scroll-mb": k()
      }],
      /**
       * Scroll Margin Left
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ml": [{
        "scroll-ml": k()
      }],
      /**
       * Scroll Padding
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-p": [{
        "scroll-p": k()
      }],
      /**
       * Scroll Padding X
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-px": [{
        "scroll-px": k()
      }],
      /**
       * Scroll Padding Y
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-py": [{
        "scroll-py": k()
      }],
      /**
       * Scroll Padding Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-ps": [{
        "scroll-ps": k()
      }],
      /**
       * Scroll Padding End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pe": [{
        "scroll-pe": k()
      }],
      /**
       * Scroll Padding Top
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pt": [{
        "scroll-pt": k()
      }],
      /**
       * Scroll Padding Right
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pr": [{
        "scroll-pr": k()
      }],
      /**
       * Scroll Padding Bottom
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pb": [{
        "scroll-pb": k()
      }],
      /**
       * Scroll Padding Left
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pl": [{
        "scroll-pl": k()
      }],
      /**
       * Scroll Snap Align
       * @see https://tailwindcss.com/docs/scroll-snap-align
       */
      "snap-align": [{
        snap: ["start", "end", "center", "align-none"]
      }],
      /**
       * Scroll Snap Stop
       * @see https://tailwindcss.com/docs/scroll-snap-stop
       */
      "snap-stop": [{
        snap: ["normal", "always"]
      }],
      /**
       * Scroll Snap Type
       * @see https://tailwindcss.com/docs/scroll-snap-type
       */
      "snap-type": [{
        snap: ["none", "x", "y", "both"]
      }],
      /**
       * Scroll Snap Type Strictness
       * @see https://tailwindcss.com/docs/scroll-snap-type
       */
      "snap-strictness": [{
        snap: ["mandatory", "proximity"]
      }],
      /**
       * Touch Action
       * @see https://tailwindcss.com/docs/touch-action
       */
      touch: [{
        touch: ["auto", "none", "manipulation"]
      }],
      /**
       * Touch Action X
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-x": [{
        "touch-pan": ["x", "left", "right"]
      }],
      /**
       * Touch Action Y
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-y": [{
        "touch-pan": ["y", "up", "down"]
      }],
      /**
       * Touch Action Pinch Zoom
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-pz": ["touch-pinch-zoom"],
      /**
       * User Select
       * @see https://tailwindcss.com/docs/user-select
       */
      select: [{
        select: ["none", "text", "all", "auto"]
      }],
      /**
       * Will Change
       * @see https://tailwindcss.com/docs/will-change
       */
      "will-change": [{
        "will-change": ["auto", "scroll", "contents", "transform", _, z]
      }],
      // -----------
      // --- SVG ---
      // -----------
      /**
       * Fill
       * @see https://tailwindcss.com/docs/fill
       */
      fill: [{
        fill: ["none", ...w()]
      }],
      /**
       * Stroke Width
       * @see https://tailwindcss.com/docs/stroke-width
       */
      "stroke-w": [{
        stroke: [te, Ss, Ft, jr]
      }],
      /**
       * Stroke
       * @see https://tailwindcss.com/docs/stroke
       */
      stroke: [{
        stroke: ["none", ...w()]
      }],
      // ---------------------
      // --- Accessibility ---
      // ---------------------
      /**
       * Forced Color Adjust
       * @see https://tailwindcss.com/docs/forced-color-adjust
       */
      "forced-color-adjust": [{
        "forced-color-adjust": ["auto", "none"]
      }]
    },
    conflictingClassGroups: {
      overflow: ["overflow-x", "overflow-y"],
      overscroll: ["overscroll-x", "overscroll-y"],
      inset: ["inset-x", "inset-y", "start", "end", "top", "right", "bottom", "left"],
      "inset-x": ["right", "left"],
      "inset-y": ["top", "bottom"],
      flex: ["basis", "grow", "shrink"],
      gap: ["gap-x", "gap-y"],
      p: ["px", "py", "ps", "pe", "pt", "pr", "pb", "pl"],
      px: ["pr", "pl"],
      py: ["pt", "pb"],
      m: ["mx", "my", "ms", "me", "mt", "mr", "mb", "ml"],
      mx: ["mr", "ml"],
      my: ["mt", "mb"],
      size: ["w", "h"],
      "font-size": ["leading"],
      "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"],
      "fvn-ordinal": ["fvn-normal"],
      "fvn-slashed-zero": ["fvn-normal"],
      "fvn-figure": ["fvn-normal"],
      "fvn-spacing": ["fvn-normal"],
      "fvn-fraction": ["fvn-normal"],
      "line-clamp": ["display", "overflow"],
      rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
      "rounded-s": ["rounded-ss", "rounded-es"],
      "rounded-e": ["rounded-se", "rounded-ee"],
      "rounded-t": ["rounded-tl", "rounded-tr"],
      "rounded-r": ["rounded-tr", "rounded-br"],
      "rounded-b": ["rounded-br", "rounded-bl"],
      "rounded-l": ["rounded-tl", "rounded-bl"],
      "border-spacing": ["border-spacing-x", "border-spacing-y"],
      "border-w": ["border-w-x", "border-w-y", "border-w-s", "border-w-e", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
      "border-w-x": ["border-w-r", "border-w-l"],
      "border-w-y": ["border-w-t", "border-w-b"],
      "border-color": ["border-color-x", "border-color-y", "border-color-s", "border-color-e", "border-color-t", "border-color-r", "border-color-b", "border-color-l"],
      "border-color-x": ["border-color-r", "border-color-l"],
      "border-color-y": ["border-color-t", "border-color-b"],
      translate: ["translate-x", "translate-y", "translate-none"],
      "translate-none": ["translate", "translate-x", "translate-y", "translate-z"],
      "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
      "scroll-mx": ["scroll-mr", "scroll-ml"],
      "scroll-my": ["scroll-mt", "scroll-mb"],
      "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
      "scroll-px": ["scroll-pr", "scroll-pl"],
      "scroll-py": ["scroll-pt", "scroll-pb"],
      touch: ["touch-x", "touch-y", "touch-pz"],
      "touch-x": ["touch"],
      "touch-y": ["touch"],
      "touch-pz": ["touch"]
    },
    conflictingClassGroupModifiers: {
      "font-size": ["leading"]
    },
    orderSensitiveModifiers: ["*", "**", "after", "backdrop", "before", "details-content", "file", "first-letter", "first-line", "marker", "placeholder", "selection"]
  };
}, rg = /* @__PURE__ */ Fx(ng);
function $e(...e) {
  return rg(Oc(e));
}
const ig = Vc(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline: "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-md"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function Q({
  className: e,
  variant: t,
  size: n,
  asChild: r = !1,
  ...i
}) {
  const a = r ? Ic : "button";
  return /* @__PURE__ */ s.jsx(
    a,
    {
      "data-slot": "button",
      className: $e(ig({ variant: t, size: n, className: e })),
      ...i
    }
  );
}
var ag = [
  "a",
  "button",
  "div",
  "form",
  "h2",
  "h3",
  "img",
  "input",
  "label",
  "li",
  "nav",
  "ol",
  "p",
  "select",
  "span",
  "svg",
  "ul"
], je = ag.reduce((e, t) => {
  const n = /* @__PURE__ */ Ws(`Primitive.${t}`), r = p.forwardRef((i, a) => {
    const { asChild: o, ...l } = i, c = o ? n : t;
    return typeof window < "u" && (window[Symbol.for("radix-ui")] = !0), /* @__PURE__ */ s.jsx(c, { ...l, ref: a });
  });
  return r.displayName = `Primitive.${t}`, { ...e, [t]: r };
}, {});
function og(e, t) {
  e && Pu.flushSync(() => e.dispatchEvent(t));
}
var lg = "Separator", Io = "horizontal", cg = ["horizontal", "vertical"], Kc = p.forwardRef((e, t) => {
  const { decorative: n, orientation: r = Io, ...i } = e, a = dg(r) ? r : Io, l = n ? { role: "none" } : { "aria-orientation": a === "vertical" ? a : void 0, role: "separator" };
  return /* @__PURE__ */ s.jsx(
    je.div,
    {
      "data-orientation": a,
      ...l,
      ...i,
      ref: t
    }
  );
});
Kc.displayName = lg;
function dg(e) {
  return cg.includes(e);
}
var ug = Kc;
function mg({
  className: e,
  orientation: t = "horizontal",
  decorative: n = !0,
  ...r
}) {
  return /* @__PURE__ */ s.jsx(
    ug,
    {
      "data-slot": "separator-root",
      decorative: n,
      orientation: t,
      className: $e(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        e
      ),
      ...r
    }
  );
}
function hg({ content: e, onChange: t, highlightRanges: n = [], disabled: r = !1, questionsCount: i = 0, onShowQuestions: a, onInsertText: o }) {
  const [l, c] = ve(!0), u = at(null);
  at(null);
  const d = (v) => {
    const g = u.current;
    if (!g) return;
    const N = g.selectionStart, j = g.selectionEnd, b = e.slice(0, N) + v + e.slice(j);
    t(b), setTimeout(() => {
      g.selectionStart = g.selectionEnd = N + v.length, g.focus();
    }, 0);
  };
  Y.useEffect(() => (o && (window.noteEditorInsertText = d), () => {
    window.noteEditorInsertText && delete window.noteEditorInsertText;
  }), [o, e]);
  const m = (v, g = v) => {
    const N = u.current;
    if (!N) return;
    const j = N.selectionStart, b = N.selectionEnd, y = e.slice(j, b);
    if (y) {
      const S = e.slice(0, j) + v + y + g + e.slice(b);
      t(S), setTimeout(() => {
        N.selectionStart = j + v.length, N.selectionEnd = b + v.length, N.focus();
      }, 0);
    }
  }, h = n && n.length > 0, f = () => {
    if (!h || !n.length || !e) return null;
    const v = [];
    let g = 0;
    [...n].sort((b, y) => b.start - y.start).forEach((b, y) => {
      b.start >= e.length || b.end > e.length || b.start >= b.end || (b.start > g && v.push({
        text: e.slice(g, b.start),
        isHighlight: !1
      }), v.push({
        text: e.slice(b.start, b.end),
        isHighlight: !0,
        highlightIndex: y,
        range: b
      }), g = b.end);
    }), g < e.length && v.push({
      text: e.slice(g),
      isHighlight: !1
    });
    const j = [
      { bg: "rgba(59, 130, 246, 0.2)", border: "rgba(59, 130, 246, 0.5)" },
      // blue
      { bg: "rgba(16, 185, 129, 0.2)", border: "rgba(16, 185, 129, 0.5)" },
      // emerald
      { bg: "rgba(245, 158, 11, 0.2)", border: "rgba(245, 158, 11, 0.5)" },
      // amber
      { bg: "rgba(139, 92, 246, 0.2)", border: "rgba(139, 92, 246, 0.5)" }
      // violet
    ];
    return /* @__PURE__ */ s.jsx(
      D.div,
      {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        className: "absolute inset-0 pointer-events-none whitespace-pre-wrap text-transparent",
        style: {
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif',
          fontSize: "14px",
          lineHeight: "1.6",
          color: "transparent",
          wordBreak: "break-word",
          overflowWrap: "break-word",
          padding: "0",
          margin: "0",
          border: "none",
          outline: "none",
          boxSizing: "border-box"
        },
        children: v.map((b, y) => {
          if (!b.isHighlight)
            return /* @__PURE__ */ s.jsx("span", { style: { color: "transparent" }, children: b.text }, y);
          const S = j[b.highlightIndex % j.length];
          return /* @__PURE__ */ s.jsxs(
            D.span,
            {
              initial: { backgroundColor: "transparent" },
              animate: {
                backgroundColor: [
                  S.bg,
                  S.bg.replace("0.2", "0.3"),
                  S.bg.replace("0.2", "0.35"),
                  S.bg.replace("0.2", "0.3"),
                  S.bg
                ]
              },
              transition: {
                duration: 2,
                repeat: 1 / 0,
                ease: "easeInOut",
                delay: b.highlightIndex * 0.3
              },
              className: "relative rounded-sm",
              style: {
                backgroundColor: S.bg,
                color: "transparent",
                boxShadow: `0 0 0 1px ${S.border}, 0 1px 3px ${S.border}20`,
                margin: "0",
                padding: "0"
              },
              children: [
                b.text,
                /* @__PURE__ */ s.jsx(
                  D.span,
                  {
                    className: "absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full shadow-sm",
                    style: { backgroundColor: S.border },
                    animate: {
                      scale: [1, 1.4, 1],
                      opacity: [0.6, 1, 0.6]
                    },
                    transition: {
                      duration: 1.8,
                      repeat: 1 / 0,
                      ease: "easeInOut",
                      delay: b.highlightIndex * 0.2
                    }
                  }
                )
              ]
            },
            y
          );
        })
      }
    );
  };
  return /* @__PURE__ */ s.jsxs("div", { className: "h-full flex flex-col", children: [
    /* @__PURE__ */ s.jsxs(
      D.div,
      {
        initial: { y: -10, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        className: "bg-white border-b border-slate-200/50 px-4 py-4",
        children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
            /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-slate-600 rounded-md flex items-center justify-center", children: /* @__PURE__ */ s.jsx(wt, { size: 16, className: "text-white" }) }),
            /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
              /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-900 mb-1", children: "John Smith" }),
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-500", children: [
                /* @__PURE__ */ s.jsx("span", { className: "font-mono", children: "ENC-2024-001247" }),
                /* @__PURE__ */ s.jsx("span", { children: "•" }),
                /* @__PURE__ */ s.jsx("span", { className: "font-mono", children: "PT-789456" })
              ] })
            ] }),
            i > 0 && a && /* @__PURE__ */ s.jsxs(
              Q,
              {
                variant: "ghost",
                size: "sm",
                onClick: a,
                className: "h-9 px-4 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200",
                title: `${i} patient question${i !== 1 ? "s" : ""} available`,
                children: [
                  /* @__PURE__ */ s.jsx(Ac, { size: 13, className: "mr-1.5" }),
                  "Patient Questions",
                  /* @__PURE__ */ s.jsx("div", { className: "w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold ml-2", children: i })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-1 flex-wrap", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-0.5", children: [
              /* @__PURE__ */ s.jsx(
                Q,
                {
                  variant: "ghost",
                  size: "sm",
                  className: "h-9 w-9 p-0 hover:bg-slate-50 text-slate-800 hover:text-slate-900",
                  onClick: () => m("**", "**"),
                  title: "Bold",
                  children: /* @__PURE__ */ s.jsx(b0, { size: 16 })
                }
              ),
              /* @__PURE__ */ s.jsx(
                Q,
                {
                  variant: "ghost",
                  size: "sm",
                  className: "h-9 w-9 p-0 hover:bg-slate-50 text-slate-800 hover:text-slate-900",
                  onClick: () => m("*", "*"),
                  title: "Italic",
                  children: /* @__PURE__ */ s.jsx(V0, { size: 16 })
                }
              ),
              /* @__PURE__ */ s.jsx(
                Q,
                {
                  variant: "ghost",
                  size: "sm",
                  className: "h-9 w-9 p-0 hover:bg-slate-50 text-slate-800 hover:text-slate-900",
                  onClick: () => m("_", "_"),
                  title: "Underline",
                  children: /* @__PURE__ */ s.jsx(ux, { size: 16 })
                }
              )
            ] }),
            /* @__PURE__ */ s.jsx(mg, { orientation: "vertical", className: "h-6 mx-1 bg-slate-200" }),
            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-0.5", children: [
              /* @__PURE__ */ s.jsx(
                Q,
                {
                  variant: "ghost",
                  size: "sm",
                  className: "h-9 w-9 p-0 hover:bg-slate-50 text-slate-800 hover:text-slate-900",
                  onClick: () => d(`
• `),
                  title: "Bullet List",
                  children: /* @__PURE__ */ s.jsx(B0, { size: 16 })
                }
              ),
              /* @__PURE__ */ s.jsx(
                Q,
                {
                  variant: "ghost",
                  size: "sm",
                  className: "h-9 w-9 p-0 hover:bg-slate-50 text-slate-800 hover:text-slate-900",
                  onClick: () => d(`
1. `),
                  title: "Numbered List",
                  children: /* @__PURE__ */ s.jsx(_0, { size: 16 })
                }
              )
            ] }),
            /* @__PURE__ */ s.jsxs("div", { className: "ml-auto flex items-center gap-0.5", children: [
              /* @__PURE__ */ s.jsx(
                Q,
                {
                  variant: "ghost",
                  size: "sm",
                  className: "h-9 w-9 p-0 hover:bg-slate-50 text-slate-800 hover:text-slate-900",
                  title: "Undo",
                  children: /* @__PURE__ */ s.jsx(hx, { size: 16 })
                }
              ),
              /* @__PURE__ */ s.jsx(
                Q,
                {
                  variant: "ghost",
                  size: "sm",
                  className: "h-9 w-9 p-0 hover:bg-slate-50 text-slate-800 hover:text-slate-900",
                  title: "Redo",
                  children: /* @__PURE__ */ s.jsx(q0, { size: 16 })
                }
              )
            ] })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ s.jsxs(
      D.div,
      {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { delay: 0.2 },
        className: `flex-1 relative rounded-lg border transition-all duration-500 overflow-hidden ${h ? "border-blue-200/70 shadow-lg shadow-blue-500/10" : "border-slate-200/50"}`,
        children: [
          /* @__PURE__ */ s.jsx(
            "div",
            {
              className: "absolute inset-0",
              style: {
                background: "linear-gradient(135deg, #fcfcfd 0%, #fafbfc 50%, #f8f9fb 100%)"
              }
            }
          ),
          /* @__PURE__ */ s.jsx(mt, { children: h && /* @__PURE__ */ s.jsx(
            D.div,
            {
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              exit: { opacity: 0 },
              transition: { duration: 0.8, ease: "easeOut" },
              className: "absolute inset-0 pointer-events-none z-0 rounded-lg",
              style: {
                background: "radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.025) 0%, transparent 60%)",
                boxShadow: "inset 0 0 0 1px rgba(59, 130, 246, 0.08)"
              }
            }
          ) }),
          /* @__PURE__ */ s.jsx(mt, { children: r && /* @__PURE__ */ s.jsx(
            D.div,
            {
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              exit: { opacity: 0 },
              transition: { duration: 0.3, ease: "easeOut" },
              className: "absolute inset-0 pointer-events-none z-5 rounded-lg",
              style: {
                background: "linear-gradient(135deg, rgba(59, 130, 246, 0.02) 0%, rgba(99, 102, 241, 0.015) 100%)",
                backdropFilter: "blur(0.5px)"
              }
            }
          ) }),
          /* @__PURE__ */ s.jsx("div", { className: "absolute inset-4", children: /* @__PURE__ */ s.jsx(
            "div",
            {
              className: "relative w-full h-full rounded-lg shadow-sm border border-slate-200/30 backdrop-blur-sm",
              style: {
                background: "linear-gradient(135deg, #fdfdfe 0%, #fbfcfd 50%, #f9fafc 100%)"
              },
              children: /* @__PURE__ */ s.jsx("div", { className: "absolute inset-4", children: /* @__PURE__ */ s.jsxs("div", { className: "relative w-full h-full", children: [
                /* @__PURE__ */ s.jsx("div", { className: "absolute inset-0 pointer-events-none z-20", children: /* @__PURE__ */ s.jsx(mt, { children: f() }) }),
                /* @__PURE__ */ s.jsx(
                  "textarea",
                  {
                    ref: u,
                    value: e,
                    onChange: (v) => !r && t(v.target.value),
                    className: `w-full h-full resize-none border-none bg-white focus:ring-0 focus:outline-none relative z-10 text-slate-900 transition-all duration-300 ${r ? "cursor-default select-none opacity-90" : ""}`,
                    placeholder: "Start documenting the medical note...",
                    disabled: r,
                    style: {
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif',
                      fontSize: "14px",
                      lineHeight: "1.6",
                      padding: "0",
                      margin: "0",
                      border: "none",
                      outline: "none",
                      boxSizing: "border-box",
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                      pointerEvents: r ? "none" : "auto",
                      backgroundColor: "#ffffff"
                    }
                  }
                )
              ] }) })
            }
          ) })
        ]
      }
    ),
    /* @__PURE__ */ s.jsx(
      D.div,
      {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        className: "px-4 py-2 bg-slate-50 border-t border-slate-200/50",
        children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between text-xs text-slate-500", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ s.jsx(
              D.div,
              {
                animate: {
                  scale: [1, 1.2, 1],
                  opacity: [0.6, 1, 0.6]
                },
                transition: {
                  duration: 2,
                  repeat: 1 / 0,
                  ease: "easeInOut"
                },
                className: "w-1.5 h-1.5 bg-green-500 rounded-full"
              }
            ),
            /* @__PURE__ */ s.jsx("span", { children: r ? "Viewing evidence highlights" : "Auto-saving draft" })
          ] }),
          /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-slate-500", children: [
            "Characters: ",
            e.length
          ] })
        ] })
      }
    )
  ] });
}
function Me({ className: e, ...t }) {
  return /* @__PURE__ */ s.jsx(
    "div",
    {
      "data-slot": "card",
      className: $e(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border",
        e
      ),
      ...t
    }
  );
}
const fg = Vc(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive: "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Be({
  className: e,
  variant: t,
  asChild: n = !1,
  ...r
}) {
  const i = n ? Ic : "span";
  return /* @__PURE__ */ s.jsx(
    i,
    {
      "data-slot": "badge",
      className: $e(fg({ variant: t }), e),
      ...r
    }
  );
}
function pg({
  questions: e,
  isOpen: t,
  onClose: n,
  onUpdateQuestions: r,
  onInsertToNote: i
}) {
  const [a, o] = ve(null), [l, c] = ve(""), [u, d] = ve(null), [m, h] = ve(null), f = (y) => {
    const S = e.filter((T) => T.id !== y);
    r(S);
  }, v = (y, S) => {
    o(y), c(S);
  }, g = (y) => {
    i && l.trim() && (i(l, y), o(null), c(""), f(y));
  }, N = (y) => {
    console.log("Sending question to patient portal:", y);
  }, j = (y) => {
    console.log("Forwarding question to staff:", y);
  }, b = (y) => {
    const S = y.question.toLowerCase(), T = y.source.toLowerCase();
    return S.includes("smoking") || T.includes("smoking") || S.includes("tobacco") ? {
      gap: "Missing tobacco use documentation",
      clinical: "Current smoking status is required for accurate cardiovascular risk stratification, proper ICD-10 coding (Z87.891, F17.210), and quality measure reporting (CMS 165v12). This impacts risk calculators for ASCVD, supports tobacco cessation counseling billing (99406-99407), and meets meaningful use requirements.",
      coding: "Without smoking history, you may miss billing opportunities for tobacco cessation counseling and risk assessment codes."
    } : S.includes("pack") || S.includes("year") ? {
      gap: "Missing quantitative smoking history",
      clinical: "Pack-year calculation (packs per day × years smoked) is essential for lung cancer screening eligibility (USPSTF guidelines), COPD risk assessment, and cardiovascular disease risk stratification. This supports billing for preventive services and shared decision-making documentation.",
      coding: "Pack-year history enables proper risk stratification coding and supports preventive screening recommendations with appropriate CPT codes."
    } : S.includes("cholesterol") || S.includes("lipid") || S.includes("ldl") ? {
      gap: "Missing recent lipid profile values",
      clinical: "Current lipid values are required to confirm hyperlipidemia diagnosis (E78.5), guide statin therapy decisions per ACC/AHA guidelines, and support quality measures (CMS 347v6). Recent values within 12 months are needed for accurate ASCVD risk calculation and treatment targets.",
      coding: "Without recent lipid values, hyperlipidemia diagnosis may be questioned, and you cannot bill for appropriate lipid management and monitoring."
    } : S.includes("weight") || S.includes("bmi") ? {
      gap: "Missing current weight/BMI documentation",
      clinical: "Current weight is mandatory for BMI calculation, obesity diagnosis coding (E66.9), medication dosing accuracy, and quality reporting (CMS 69v12). BMI ≥30 enables obesity counseling billing (G0447) and supports medical necessity for weight management interventions.",
      coding: "Missing weight/BMI prevents proper obesity-related diagnosis coding and billing for weight management counseling services."
    } : S.includes("family history") || S.includes("family") ? {
      gap: "Incomplete family history documentation",
      clinical: "Family history of cardiovascular disease affects risk stratification per USPSTF guidelines, supports genetic counseling referrals, and influences screening recommendations. This information is crucial for shared decision-making documentation and preventive care planning.",
      coding: "Family history supports enhanced risk factor coding (Z82.49) and justifies more frequent monitoring and preventive interventions."
    } : S.includes("blood pressure") || S.includes("hypertension") ? {
      gap: "Missing blood pressure trend documentation",
      clinical: "Blood pressure trends are essential for hypertension staging (I10-I16), treatment effectiveness monitoring, and quality measure compliance (CMS 165v12). Multiple readings support proper diagnosis and treatment adjustment documentation.",
      coding: "Proper BP documentation enables accurate hypertension coding and supports medical necessity for antihypertensive therapy monitoring."
    } : S.includes("medication") || S.includes("drug") ? {
      gap: "Incomplete medication reconciliation",
      clinical: "Current medication list is required for drug interaction screening, adherence assessment, and quality reporting. This supports medication therapy management billing and ensures patient safety through comprehensive pharmaceutical care.",
      coding: "Complete medication documentation enables proper polypharmacy management coding and supports MTM services billing."
    } : S.includes("alcohol") || S.includes("drinking") ? {
      gap: "Missing alcohol use documentation",
      clinical: "Alcohol consumption assessment is required for liver function evaluation, drug interaction screening, and quality measures. This supports screening and brief intervention billing (G0396-G0397) and cardiovascular risk assessment.",
      coding: "Alcohol use documentation enables appropriate substance use disorder coding and supports preventive counseling services."
    } : {
      gap: "Documentation gap identified",
      clinical: "This information helps complete clinical documentation gaps identified during the coding review process. Complete documentation ensures accurate diagnosis coding, supports medical necessity, and enables appropriate quality measure reporting.",
      coding: "Addressing this gap ensures comprehensive documentation that supports accurate coding and billing for all applicable services."
    };
  };
  return /* @__PURE__ */ s.jsx(mt, { children: t && /* @__PURE__ */ s.jsxs(
    D.div,
    {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      className: "fixed inset-0 z-[100] flex items-center justify-center",
      onClick: n,
      children: [
        /* @__PURE__ */ s.jsx("div", { className: "absolute inset-0 bg-black/20 backdrop-blur-sm" }),
        /* @__PURE__ */ s.jsxs(
          D.div,
          {
            initial: { opacity: 0, scale: 0.95, y: 20 },
            animate: { opacity: 1, scale: 1, y: 0 },
            exit: { opacity: 0, scale: 0.95, y: 20 },
            transition: { duration: 0.2, ease: "easeOut" },
            className: "relative w-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-slate-200/50 overflow-hidden",
            onClick: (y) => y.stopPropagation(),
            children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between p-6 border-b border-slate-100 bg-gradient-to-r from-amber-50/50 to-orange-50/50", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-12 h-12 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg", children: /* @__PURE__ */ s.jsx(Ac, { size: 20, className: "text-white" }) }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("h2", { className: "text-xl font-semibold text-slate-900", children: "Patient Follow-up Questions" }),
                    /* @__PURE__ */ s.jsxs("p", { className: "text-sm text-slate-600 mt-1", children: [
                      e.length,
                      " question",
                      e.length !== 1 ? "s" : "",
                      " to complete documentation"
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ s.jsx(
                  "button",
                  {
                    onClick: n,
                    className: "w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/60 transition-colors group",
                    children: /* @__PURE__ */ s.jsx(Fn, { size: 18, className: "text-slate-400 group-hover:text-slate-600" })
                  }
                )
              ] }),
              /* @__PURE__ */ s.jsx("div", { className: "p-6 max-h-[60vh] overflow-y-auto", children: /* @__PURE__ */ s.jsx("div", { className: "space-y-4", children: e.map((y, S) => /* @__PURE__ */ s.jsx(
                D.div,
                {
                  initial: { opacity: 0, y: 10 },
                  animate: { opacity: 1, y: 0 },
                  transition: { delay: S * 0.1 },
                  className: "relative",
                  children: /* @__PURE__ */ s.jsxs(Me, { className: "p-5 hover:shadow-md transition-all duration-200 border border-slate-200/60 bg-gradient-to-r from-white to-slate-50/30", children: [
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-4 mb-4", children: [
                      /* @__PURE__ */ s.jsx("div", { className: `w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${y.priority === "high" ? "bg-red-100 text-red-600" : y.priority === "medium" ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"}`, children: /* @__PURE__ */ s.jsx(wt, { size: 16 }) }),
                      /* @__PURE__ */ s.jsxs("div", { className: "flex-1 min-w-0", children: [
                        /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-2", children: [
                          /* @__PURE__ */ s.jsxs("span", { className: `text-xs px-3 py-1 rounded-full font-medium ${y.priority === "high" ? "bg-red-100 text-red-700" : y.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`, children: [
                            y.priority,
                            " priority"
                          ] }),
                          /* @__PURE__ */ s.jsx("span", { className: "text-xs text-slate-500", children: y.source }),
                          /* @__PURE__ */ s.jsxs(
                            "div",
                            {
                              className: "relative",
                              onMouseEnter: (T) => {
                                d(y.id);
                                const E = T.currentTarget.getBoundingClientRect();
                                h({
                                  x: E.left + E.width / 2,
                                  y: E.top - 10
                                });
                              },
                              onMouseLeave: () => {
                                d(null), h(null);
                              },
                              children: [
                                /* @__PURE__ */ s.jsxs(
                                  D.div,
                                  {
                                    className: "flex items-center gap-1.5 cursor-help text-slate-400 hover:text-blue-500 transition-colors",
                                    whileHover: { scale: 1.05 },
                                    children: [
                                      /* @__PURE__ */ s.jsx(Jr, { size: 12 }),
                                      /* @__PURE__ */ s.jsx("span", { className: "text-xs", children: "Why?" })
                                    ]
                                  }
                                ),
                                /* @__PURE__ */ s.jsx(mt, { children: u === y.id && m && /* @__PURE__ */ s.jsxs(
                                  D.div,
                                  {
                                    initial: { opacity: 0, y: 5, scale: 0.95 },
                                    animate: { opacity: 1, y: 0, scale: 1 },
                                    exit: { opacity: 0, y: 5, scale: 0.95 },
                                    className: "fixed w-96 p-4 bg-slate-800/95 text-white text-xs rounded-lg shadow-xl backdrop-blur-sm pointer-events-none",
                                    style: {
                                      zIndex: 1e4,
                                      left: m.x,
                                      top: m.y,
                                      transform: "translate(-50%, -100%)",
                                      maxWidth: "24rem"
                                    },
                                    children: [
                                      /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-2", children: [
                                        /* @__PURE__ */ s.jsx(Rc, { size: 12, className: "text-amber-400 mt-0.5 flex-shrink-0" }),
                                        /* @__PURE__ */ s.jsxs("div", { children: [
                                          /* @__PURE__ */ s.jsx("div", { className: "font-medium text-amber-300 mb-2", children: b(y).gap }),
                                          /* @__PURE__ */ s.jsxs("div", { className: "leading-relaxed mb-2", children: [
                                            /* @__PURE__ */ s.jsx("span", { className: "text-blue-300 font-medium", children: "Clinical Impact:" }),
                                            /* @__PURE__ */ s.jsx("br", {}),
                                            b(y).clinical
                                          ] }),
                                          /* @__PURE__ */ s.jsxs("div", { className: "leading-relaxed", children: [
                                            /* @__PURE__ */ s.jsx("span", { className: "text-green-300 font-medium", children: "Coding/Billing Impact:" }),
                                            /* @__PURE__ */ s.jsx("br", {}),
                                            b(y).coding
                                          ] })
                                        ] })
                                      ] }),
                                      /* @__PURE__ */ s.jsx("div", { className: "absolute top-full left-1/2 -translate-x-1/2", style: {
                                        width: 0,
                                        height: 0,
                                        borderLeft: "6px solid transparent",
                                        borderRight: "6px solid transparent",
                                        borderTop: "6px solid rgba(30, 41, 59, 0.95)"
                                      } })
                                    ]
                                  }
                                ) })
                              ]
                            }
                          )
                        ] }),
                        /* @__PURE__ */ s.jsx("div", { className: "mb-3", children: /* @__PURE__ */ s.jsxs("p", { className: "text-slate-800 font-medium leading-relaxed", children: [
                          '"',
                          y.question,
                          '"'
                        ] }) }),
                        /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-slate-500", children: [
                          "Related to: ",
                          /* @__PURE__ */ s.jsx("span", { className: "font-medium text-slate-700", children: y.codeRelated })
                        ] })
                      ] })
                    ] }),
                    /* @__PURE__ */ s.jsx(mt, { children: a === y.id && /* @__PURE__ */ s.jsx(
                      D.div,
                      {
                        initial: { opacity: 0, height: 0 },
                        animate: { opacity: 1, height: "auto" },
                        exit: { opacity: 0, height: 0 },
                        className: "mb-4 overflow-hidden",
                        children: /* @__PURE__ */ s.jsxs("div", { className: "bg-white rounded-lg border border-slate-200 p-3", children: [
                          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
                            /* @__PURE__ */ s.jsx(ei, { size: 14, className: "text-blue-600" }),
                            /* @__PURE__ */ s.jsx("span", { className: "text-sm font-medium text-slate-700", children: "Patient Response" })
                          ] }),
                          /* @__PURE__ */ s.jsx(
                            "textarea",
                            {
                              value: l,
                              onChange: (T) => c(T.target.value),
                              placeholder: "Enter the patient's response to this question...",
                              className: "w-full h-24 p-3 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors",
                              autoFocus: !0
                            }
                          ),
                          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between mt-3", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500", children: "This will be inserted into the appropriate section of your note" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex gap-2", children: [
                              /* @__PURE__ */ s.jsx(
                                Q,
                                {
                                  size: "sm",
                                  variant: "outline",
                                  onClick: () => o(null),
                                  className: "h-8 px-3 text-xs",
                                  children: "Cancel"
                                }
                              ),
                              /* @__PURE__ */ s.jsxs(
                                Q,
                                {
                                  size: "sm",
                                  onClick: () => g(y.id),
                                  disabled: !l.trim(),
                                  className: "h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700",
                                  children: [
                                    /* @__PURE__ */ s.jsx(Jt, { size: 12, className: "mr-1" }),
                                    "Insert to Note"
                                  ]
                                }
                              )
                            ] })
                          ] })
                        ] })
                      }
                    ) }),
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                      /* @__PURE__ */ s.jsxs(
                        Q,
                        {
                          size: "sm",
                          onClick: () => v(y.id, `Patient response: ${y.question.toLowerCase()}`),
                          disabled: a === y.id,
                          className: "h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 flex-1",
                          children: [
                            /* @__PURE__ */ s.jsx(ei, { size: 12, className: "mr-1" }),
                            "Ask Patient"
                          ]
                        }
                      ),
                      /* @__PURE__ */ s.jsxs(
                        Q,
                        {
                          size: "sm",
                          variant: "outline",
                          onClick: () => N(y.id),
                          className: "h-8 px-3 text-xs border-blue-200 text-blue-700 hover:bg-blue-50",
                          children: [
                            /* @__PURE__ */ s.jsx(J0, { size: 12, className: "mr-1" }),
                            "Send to Portal"
                          ]
                        }
                      ),
                      /* @__PURE__ */ s.jsxs(
                        Q,
                        {
                          size: "sm",
                          variant: "outline",
                          onClick: () => j(y.id),
                          className: "h-8 px-3 text-xs border-purple-200 text-purple-700 hover:bg-purple-50",
                          children: [
                            /* @__PURE__ */ s.jsx(xx, { size: 12, className: "mr-1" }),
                            "Forward to Staff"
                          ]
                        }
                      ),
                      /* @__PURE__ */ s.jsxs(
                        Q,
                        {
                          size: "sm",
                          variant: "outline",
                          onClick: () => f(y.id),
                          className: "h-8 px-3 text-xs border-slate-200 text-slate-600 hover:bg-slate-50",
                          children: [
                            /* @__PURE__ */ s.jsx(Fn, { size: 12, className: "mr-1" }),
                            "Dismiss"
                          ]
                        }
                      )
                    ] })
                  ] })
                },
                y.id
              )) }) }),
              /* @__PURE__ */ s.jsx("div", { className: "p-6 border-t border-slate-100 bg-slate-50/50", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between", children: [
                /* @__PURE__ */ s.jsx("div", { className: "text-sm text-slate-600", children: "Address these questions during your patient encounter to improve documentation quality" }),
                /* @__PURE__ */ s.jsxs("div", { className: "flex gap-3", children: [
                  /* @__PURE__ */ s.jsx(
                    Q,
                    {
                      size: "sm",
                      variant: "outline",
                      onClick: () => {
                        r([]), n();
                      },
                      className: "h-9 px-4",
                      children: "Clear All Questions"
                    }
                  ),
                  /* @__PURE__ */ s.jsx(
                    Q,
                    {
                      size: "sm",
                      onClick: n,
                      className: "h-9 px-6 bg-slate-800 hover:bg-slate-900",
                      children: "Done"
                    }
                  )
                ] })
              ] }) })
            ]
          }
        )
      ]
    }
  ) });
}
const xg = (e, t) => !e || !Array.isArray(e) ? [] : e.map((n, r) => {
  if (!n || !n.id || !n.title) return null;
  const i = ["high", "medium", "low"][r % 3];
  let a;
  n.codeType === "CPT" ? a = "CPT" : n.codeType === "Public Health" ? a = "Public Health" : a = "ICD-10";
  let o, l, c;
  switch (t) {
    case 1:
      o = "Accurate diagnostic coding ensures proper billing, supports medical necessity, and provides clear communication with other healthcare providers about the patient's condition.", l = "Verify the code against the patient's documented symptoms, examination findings, and diagnostic results. Confirm the code specificity and ensure it aligns with current ICD-10 guidelines.", c = `${n.details || "No details available"} - This diagnostic code requires review to ensure accuracy and specificity for optimal patient care documentation and billing compliance.`;
      break;
    case 2:
      o = "AI-suggested codes help ensure comprehensive diagnosis capture and may identify conditions that could be overlooked, improving both patient care and billing accuracy.", l = "Evaluate each suggested code against the patient's presentation and documented findings. Accept codes that are clinically relevant and supported by documentation.", c = `${n.details || "No details available"} - This AI recommendation should be evaluated for clinical relevance and documentation support before adding to the patient's diagnosis list.`;
      break;
    default:
      o = "This item requires attention to ensure complete and accurate medical documentation that meets clinical and regulatory standards.", l = "Follow established protocols to review and complete this documentation requirement systematically and thoroughly.", c = `${n.details || "No details available"} - Complete this requirement to maintain documentation integrity and compliance.`;
  }
  return {
    ...n,
    priority: i,
    category: a,
    codeType: n.codeType || "ICD-10",
    // Ensure codeType is preserved
    why: o,
    how: l,
    what: c
  };
}).filter(Boolean);
function gg({ step: e, onNext: t, onPrevious: n, onActiveItemChange: r, onShowEvidence: i, patientQuestions: a = [], onUpdatePatientQuestions: o, showPatientTray: l, onShowPatientTray: c, onInsertToNote: u }) {
  const [d, m] = ve(0), [h, f] = ve(e.items ? xg(e.items, e.id) : []), [v, g] = ve(!1), [N, j] = ve(!1), [b, y] = ve(!1), S = l !== void 0 ? l : !1, T = c || (() => {
  }), [E, A] = ve(null), [k, L] = ve(/* @__PURE__ */ new Set()), O = v ? h.filter((w) => w && w.status !== "completed") : h, q = O.length > 0 ? Math.min(Math.max(0, d), O.length - 1) : 0, P = O.length > 0 ? O[q] : null;
  Y.useEffect(() => {
    r && r(P);
  }, [P, r]);
  const be = (w, B) => {
    f((W) => !W || !Array.isArray(W) ? W : W.map(
      (G) => G && G.id === w ? { ...G, status: B } : G
    ));
  }, me = (w) => {
    if (!w) return /* @__PURE__ */ s.jsx(wo, { size: 14, className: "text-slate-400" });
    switch (w) {
      case "completed":
      case "confirmed":
        return /* @__PURE__ */ s.jsx(_e, { size: 14, className: "text-emerald-600" });
      case "in-progress":
        return /* @__PURE__ */ s.jsx(br, { size: 14, className: "text-amber-500" });
      default:
        return /* @__PURE__ */ s.jsx(wo, { size: 14, className: "text-slate-400" });
    }
  }, pe = (w) => {
    if (!w) return "bg-slate-50 border-slate-200 text-slate-700";
    switch (w) {
      case "ICD-10":
        return "bg-blue-50 border-blue-200 text-blue-700";
      case "CPT":
        return "bg-green-50 border-green-200 text-green-700";
      case "Public Health":
        return "bg-purple-50 border-purple-200 text-purple-700";
      default:
        return "bg-slate-50 border-slate-200 text-slate-700";
    }
  }, de = (w) => {
    if (!w) return /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-slate-500 rounded-full" });
    switch (w) {
      case "high":
        return /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-red-500 rounded-full" });
      case "medium":
        return /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-amber-500 rounded-full" });
      case "low":
        return /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-green-500 rounded-full" });
      default:
        return /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-slate-500 rounded-full" });
    }
  }, re = (w) => {
    const B = {};
    return O.forEach((W) => {
      if (!W) return;
      let G;
      switch (w) {
        case "priority":
          G = W.priority || "unknown";
          break;
        case "category":
          G = W.category || "unknown";
          break;
        case "status":
          G = W.status || "unknown";
          break;
        default:
          G = "unknown";
      }
      B[G] || (B[G] = []), B[G].push(W);
    }), B;
  };
  return /* @__PURE__ */ s.jsxs(
    D.div,
    {
      initial: { opacity: 0, x: 20 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -20 },
      transition: { duration: 0.3 },
      className: "h-full flex flex-col",
      children: [
        /* @__PURE__ */ s.jsx("div", { className: "flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-white/30 px-4 py-6 shadow-lg shadow-slate-900/10", children: /* @__PURE__ */ s.jsxs(
          D.div,
          {
            initial: { y: -10, opacity: 0 },
            animate: { y: 0, opacity: 1 },
            transition: { delay: 0.1 },
            children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between mb-3", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: `w-8 h-8 rounded-lg flex items-center justify-center text-white font-medium ${e.stepType === "selected" ? "bg-gradient-to-r from-emerald-500 to-teal-600" : e.stepType === "suggested" ? "bg-gradient-to-r from-violet-500 to-purple-600" : "bg-gradient-to-r from-blue-500 to-indigo-600"}`, children: e.stepType === "selected" ? "✓" : e.stepType === "suggested" ? /* @__PURE__ */ s.jsx(mn, { size: 14, className: "text-white" }) : e.id }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                      /* @__PURE__ */ s.jsx("h2", { className: `font-semibold ${e.id === 1 ? "text-xl bg-gradient-to-r from-slate-800 to-emerald-700 bg-clip-text text-transparent" : e.id === 2 ? "text-xl bg-gradient-to-r from-slate-800 to-purple-600 bg-clip-text text-transparent" : "text-slate-800"}`, children: e.title }),
                      e.stepType && /* @__PURE__ */ s.jsx("span", { className: `text-xs px-2 py-0.5 rounded-md font-medium ${e.stepType === "selected" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`, children: e.stepType === "selected" ? "Your Codes" : "AI Suggestions" })
                    ] }),
                    e.id !== 1 && /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: e.description })
                  ] })
                ] }),
                (e.id === 1 || e.id === 2) && /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-6", children: [
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ s.jsx(dn, { size: 14, className: "text-emerald-600" }),
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-1", children: [
                      /* @__PURE__ */ s.jsx("span", { className: "text-sm font-medium text-emerald-700", children: "Selected:" }),
                      /* @__PURE__ */ s.jsx("span", { className: "text-sm font-bold text-emerald-800", children: e.totalSelected || 0 })
                    ] })
                  ] }),
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ s.jsx(mn, { size: 14, className: "text-violet-600" }),
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-1", children: [
                      /* @__PURE__ */ s.jsx("span", { className: "text-sm font-medium text-violet-700", children: "AI Suggested:" }),
                      /* @__PURE__ */ s.jsx("span", { className: "text-sm font-bold text-violet-800", children: e.totalSuggestions || 0 })
                    ] })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "space-y-2", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex justify-between items-center text-xs", children: [
                  /* @__PURE__ */ s.jsx("span", { className: "text-slate-500", children: "Progress" }),
                  /* @__PURE__ */ s.jsxs("span", { className: "text-slate-500", children: [
                    h.filter((w) => w && w.status === "completed").length,
                    "/",
                    h.length
                  ] })
                ] }),
                /* @__PURE__ */ s.jsx("div", { className: "w-full bg-slate-200 rounded-full h-1.5", children: /* @__PURE__ */ s.jsx(
                  D.div,
                  {
                    className: `h-1.5 rounded-full ${e.stepType === "selected" ? "bg-gradient-to-r from-emerald-500 to-teal-500" : e.stepType === "suggested" ? "bg-gradient-to-r from-violet-500 to-purple-500" : "bg-gradient-to-r from-blue-500 to-indigo-500"}`,
                    initial: { width: 0 },
                    animate: {
                      width: `${h.length > 0 ? h.filter((w) => w && w.status === "completed").length / h.length * 100 : 0}%`
                    },
                    transition: { duration: 0.6, ease: "easeInOut" }
                  }
                ) })
              ] })
            ]
          }
        ) }),
        /* @__PURE__ */ s.jsxs(
          "div",
          {
            className: "flex-none relative group",
            style: { height: "30vh" },
            onMouseEnter: () => y(!0),
            onMouseLeave: () => y(!1),
            children: [
              /* @__PURE__ */ s.jsxs("div", { className: "absolute top-4 left-4 right-4 z-20 flex items-center justify-between", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ s.jsxs(
                    "button",
                    {
                      onClick: () => j(!0),
                      className: "font-medium text-slate-700 text-sm bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm hover:bg-white hover:shadow-md transition-all duration-200 cursor-pointer border border-transparent hover:border-slate-200 flex items-center gap-1",
                      children: [
                        /* @__PURE__ */ s.jsx(Co, { size: 12 }),
                        "Items (",
                        O.length,
                        v && h.length !== O.length ? ` of ${h.length}` : "",
                        ")"
                      ]
                    }
                  ),
                  /* @__PURE__ */ s.jsxs(
                    Q,
                    {
                      variant: "outline",
                      size: "sm",
                      onClick: () => {
                        g(!v), m(0);
                      },
                      className: "h-7 px-2 bg-white/90 backdrop-blur-sm border-slate-200 hover:bg-white text-xs",
                      title: v ? "Show completed items" : "Hide completed items",
                      children: [
                        v ? /* @__PURE__ */ s.jsx(P0, { size: 12 }) : /* @__PURE__ */ s.jsx(jt, { size: 12 }),
                        /* @__PURE__ */ s.jsxs("span", { className: "ml-1", children: [
                          v ? "Show" : "Hide",
                          " Done"
                        ] })
                      ]
                    }
                  )
                ] }),
                O.length > 1 && /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200/50 p-1", children: [
                  /* @__PURE__ */ s.jsx(
                    Q,
                    {
                      variant: "ghost",
                      size: "sm",
                      onClick: () => {
                        const w = q > 0 ? q - 1 : O.length - 1, B = h.findIndex((W) => W.id === O[w].id);
                        m(B);
                      },
                      className: "h-6 w-6 p-0 hover:bg-slate-100",
                      disabled: O.length <= 1,
                      children: /* @__PURE__ */ s.jsx(cn, { size: 14 })
                    }
                  ),
                  /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-slate-600 px-2 font-medium min-w-[3rem] text-center", children: [
                    q + 1,
                    "/",
                    O.length
                  ] }),
                  /* @__PURE__ */ s.jsx(
                    Q,
                    {
                      variant: "ghost",
                      size: "sm",
                      onClick: () => {
                        const w = q < O.length - 1 ? q + 1 : 0, B = h.findIndex((W) => W.id === O[w].id);
                        m(B);
                      },
                      className: "h-6 w-6 p-0 hover:bg-slate-100",
                      disabled: O.length <= 1,
                      children: /* @__PURE__ */ s.jsx(Lt, { size: 14 })
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ s.jsx(mt, { children: O.length > 1 && b && /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                /* @__PURE__ */ s.jsx(
                  D.button,
                  {
                    onClick: () => {
                      const w = q > 0 ? q - 1 : O.length - 1, B = h.findIndex((W) => W.id === O[w].id);
                      m(B);
                    },
                    className: "absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-white/95 backdrop-blur-sm border border-slate-200/50 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group",
                    disabled: O.length <= 1,
                    initial: { opacity: 0, x: -10, scale: 0.8 },
                    animate: { opacity: 1, x: 0, scale: 1 },
                    exit: { opacity: 0, x: -10, scale: 0.8 },
                    transition: { duration: 0.2, ease: "easeOut" },
                    whileHover: { scale: 1.05, x: -2 },
                    whileTap: { scale: 0.95 },
                    children: /* @__PURE__ */ s.jsx(cn, { size: 18, className: "text-slate-600 group-hover:text-slate-800 transition-colors" })
                  }
                ),
                /* @__PURE__ */ s.jsx(
                  D.button,
                  {
                    onClick: () => {
                      const w = q < O.length - 1 ? q + 1 : 0, B = h.findIndex((W) => W.id === O[w].id);
                      m(B);
                    },
                    className: "absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-white/95 backdrop-blur-sm border border-slate-200/50 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group",
                    disabled: O.length <= 1,
                    initial: { opacity: 0, x: 10, scale: 0.8 },
                    animate: { opacity: 1, x: 0, scale: 1 },
                    exit: { opacity: 0, x: 10, scale: 0.8 },
                    transition: { duration: 0.2, ease: "easeOut" },
                    whileHover: { scale: 1.05, x: 2 },
                    whileTap: { scale: 0.95 },
                    children: /* @__PURE__ */ s.jsx(Lt, { size: 18, className: "text-slate-600 group-hover:text-slate-800 transition-colors" })
                  }
                )
              ] }) }),
              /* @__PURE__ */ s.jsxs(
                D.div,
                {
                  initial: { y: 20, opacity: 0 },
                  animate: { y: 0, opacity: 1 },
                  transition: { delay: 0.2 },
                  className: "h-full relative",
                  children: [
                    (e.id === 1 || e.id === 2) && h.length > 0 && /* @__PURE__ */ s.jsx(
                      D.div,
                      {
                        initial: { opacity: 0, y: 10 },
                        animate: { opacity: 1, y: 0 },
                        transition: { delay: 0.5 },
                        className: "absolute bottom-3 right-6 z-20",
                        children: /* @__PURE__ */ s.jsx("div", { className: "bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-white/50 px-2 py-1", children: /* @__PURE__ */ s.jsx("div", { className: "flex items-center gap-2 text-xs", children: (() => {
                          const w = h.filter((W) => W.codeType === "ICD-10").length, B = h.filter((W) => W.codeType === "CPT").length;
                          return w > 0 && B > 0 ? /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-1", children: [
                              /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full shadow-sm" }),
                              /* @__PURE__ */ s.jsxs("span", { className: "text-xs text-blue-600 font-medium", children: [
                                "ICD ",
                                w
                              ] })
                            ] }),
                            /* @__PURE__ */ s.jsx("div", { className: "w-px h-3 bg-slate-200" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-1", children: [
                              /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-green-500 rounded-full shadow-sm" }),
                              /* @__PURE__ */ s.jsxs("span", { className: "text-xs text-green-600 font-medium", children: [
                                "CPT ",
                                B
                              ] })
                            ] })
                          ] }) : w > 0 ? /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-1", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full shadow-sm" }),
                            /* @__PURE__ */ s.jsxs("span", { className: "text-xs text-blue-600 font-medium", children: [
                              "ICD ",
                              w
                            ] })
                          ] }) : B > 0 ? /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-1", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-green-500 rounded-full shadow-sm" }),
                            /* @__PURE__ */ s.jsxs("span", { className: "text-xs text-green-600 font-medium", children: [
                              "CPT ",
                              B
                            ] })
                          ] }) : null;
                        })() }) })
                      }
                    ),
                    O.length > 0 ? /* @__PURE__ */ s.jsx("div", { className: "absolute inset-x-4 top-4 bottom-0 flex items-center justify-center overflow-visible rounded-xl", children: /* @__PURE__ */ s.jsx("div", { className: "relative w-full h-full", style: { padding: "0 140px" }, children: O.map((w, B) => {
                      if (!w || !w.id) return null;
                      const W = B - q, G = B === q, xe = Math.abs(W), oe = 0.75, ee = 1, we = G ? ee : Math.max(oe, 1 - xe * 0.08), le = 308, Le = 2.5, He = 200, Qe = 140 + le * 0.25, tt = Math.max(-Qe, Math.min(Qe, W * He));
                      return /* @__PURE__ */ s.jsx(
                        D.div,
                        {
                          className: "absolute cursor-pointer card-floating-focus",
                          style: {
                            zIndex: O.length - xe + (G ? 10 : 0),
                            // Active card always on top
                            transformOrigin: "center center",
                            left: "50%",
                            top: "50%"
                          },
                          animate: {
                            scale: we,
                            x: tt - le / 2,
                            y: G ? -106 : -99,
                            // Active card floats slightly higher (moved up 5mm more)
                            z: G ? 50 : 0,
                            // Active card appears closer
                            opacity: xe > Le ? 0 : Math.max(0.4, 1 - xe * 0.15),
                            rotateY: Math.min(Math.max(W * 4, -15), 15)
                            // Reduced rotation
                          },
                          transition: {
                            duration: 0.5,
                            ease: "easeOut",
                            type: "spring",
                            stiffness: 300,
                            damping: 30
                          },
                          onClick: () => {
                            O.length > 0 && B >= 0 && B < O.length && m(B);
                          },
                          whileHover: {
                            scale: Math.min(ee + 0.02, we + 0.02),
                            // Constrained hover scale
                            y: G ? -109 : -102
                            // Slightly higher on hover (moved up 5mm more)
                          },
                          initial: { opacity: 0, scale: 0.8 },
                          children: /* @__PURE__ */ s.jsxs(Me, { className: `
                        w-[308px] h-[188px] bg-white/98 backdrop-blur-xl relative overflow-hidden group
                        border border-slate-200/50
                        ${G ? "shadow-2xl shadow-slate-900/20 border-slate-300/60 bg-white" : "shadow-lg shadow-slate-900/15 hover:shadow-xl hover:shadow-slate-900/25"}
                        transition-all duration-300
                      `, children: [
                            /* @__PURE__ */ s.jsx("div", { className: `absolute top-0 left-0 bottom-0 w-1 ${w.category === "ICD-10" ? "bg-blue-500" : w.category === "CPT" ? "bg-green-500" : w.category === "Public Health" ? "bg-purple-500" : "bg-slate-500"}` }),
                            /* @__PURE__ */ s.jsxs("div", { className: "relative z-10 h-full p-5 flex flex-col", children: [
                              /* @__PURE__ */ s.jsxs("div", { className: "flex items-start justify-between mb-3", children: [
                                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                                  /* @__PURE__ */ s.jsx("div", { className: `w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${w.category === "ICD-10" ? "bg-blue-100 text-blue-600" : w.category === "CPT" ? "bg-green-100 text-green-600" : w.category === "Public Health" ? "bg-purple-100 text-purple-600" : "bg-slate-100 text-slate-600"}`, children: e.stepType === "selected" ? /* @__PURE__ */ s.jsx(dn, { size: 14 }) : e.stepType === "suggested" ? /* @__PURE__ */ s.jsx(mn, { size: 14 }) : me(w.status) }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "flex flex-col gap-0.5", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: `text-xs font-bold leading-none ${w.category === "ICD-10" ? "text-blue-700" : w.category === "CPT" ? "text-green-700" : w.category === "Public Health" ? "text-purple-700" : "text-slate-700"}`, children: w.category }),
                                    /* @__PURE__ */ s.jsx("div", { className: `text-xs font-medium leading-none ${e.stepType === "selected" ? "text-emerald-600" : e.stepType === "suggested" ? "text-violet-600" : "text-slate-500"}`, children: e.stepType === "selected" ? "Selected" : e.stepType === "suggested" ? "AI Suggested" : "Review Item" })
                                  ] })
                                ] }),
                                /* @__PURE__ */ s.jsx("div", { className: "flex flex-col items-end gap-1.5", children: (e.id === 1 || e.id === 2) && w.confidence && /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                                  e.stepType === "selected" && w.gaps?.length > 0 && /* @__PURE__ */ s.jsx(
                                    D.div,
                                    {
                                      animate: {
                                        color: [
                                          "rgb(146, 64, 14)",
                                          // dark yellow (amber-800)
                                          "rgb(217, 119, 6)",
                                          // medium yellow-orange (amber-600) 
                                          "rgb(245, 158, 11)",
                                          // semi-bright yellow-orange (amber-500)
                                          "rgb(217, 119, 6)",
                                          // medium yellow-orange (amber-600)
                                          "rgb(146, 64, 14)"
                                          // dark yellow (amber-800)
                                        ]
                                      },
                                      transition: {
                                        duration: 2,
                                        repeat: 1 / 0,
                                        ease: "easeInOut"
                                      },
                                      children: /* @__PURE__ */ s.jsx(Rc, { size: 14 })
                                    }
                                  ),
                                  /* @__PURE__ */ s.jsxs("div", { className: `flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm ${w.confidence >= 90 ? "bg-emerald-100 text-emerald-700" : w.confidence >= 75 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`, children: [
                                    /* @__PURE__ */ s.jsx(vr, { size: 9 }),
                                    w.confidence,
                                    "%"
                                  ] })
                                ] }) })
                              ] }),
                              /* @__PURE__ */ s.jsx("div", { className: "mb-3", style: { minHeight: "2.8rem" }, children: /* @__PURE__ */ s.jsx("h4", { className: "font-semibold text-slate-900 text-sm leading-[1.35] line-clamp-2", children: w.title || "Untitled" }) }),
                              /* @__PURE__ */ s.jsx("div", { className: "flex-1 mb-3", style: { minHeight: "2.4rem" }, children: /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600 leading-[1.4] line-clamp-2 h-full flex items-start", children: w.details || "No details available" }) }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between pt-1", children: [
                                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2.5 text-xs", children: [
                                  e.stepType === "selected" && w.docSupport && /* @__PURE__ */ s.jsxs("div", { className: `flex items-center gap-1.5 ${w.docSupport === "strong" ? "text-emerald-600" : w.docSupport === "moderate" ? "text-amber-600" : "text-red-600"}`, children: [
                                    /* @__PURE__ */ s.jsx(gr, { size: 11 }),
                                    /* @__PURE__ */ s.jsx("span", { className: "capitalize font-medium", children: w.docSupport })
                                  ] }),
                                  e.stepType === "suggested" && w.suggestedBy && /* @__PURE__ */ s.jsxs("div", { className: "text-violet-600 flex items-center gap-1.5", children: [
                                    /* @__PURE__ */ s.jsx(No, { size: 11 }),
                                    /* @__PURE__ */ s.jsx("span", { className: "font-medium", children: w.suggestedBy })
                                  ] })
                                ] }),
                                /* @__PURE__ */ s.jsx("div", { className: `w-7 h-7 rounded-full flex items-center justify-center shadow-sm ${w.status === "completed" ? "bg-emerald-100 text-emerald-600" : w.status === "in-progress" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`, children: me(w.status) })
                              ] })
                            ] })
                          ] })
                        },
                        w.id
                      );
                    }) }) }) : /* @__PURE__ */ s.jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ s.jsxs("div", { className: "text-center p-8 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm", children: [
                      /* @__PURE__ */ s.jsx(_e, { size: 32, className: "text-emerald-500 mx-auto mb-3" }),
                      /* @__PURE__ */ s.jsx("h4", { className: "font-medium text-slate-800 mb-2", children: "All items completed!" }),
                      /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mb-3", children: "Great job! All items in this step have been completed." }),
                      /* @__PURE__ */ s.jsxs(
                        Q,
                        {
                          variant: "outline",
                          size: "sm",
                          onClick: () => g(!1),
                          className: "text-xs",
                          children: [
                            /* @__PURE__ */ s.jsx(jt, { size: 12, className: "mr-1" }),
                            "Show completed items"
                          ]
                        }
                      )
                    ] }) })
                  ]
                }
              ),
              (e.id === 1 || e.id === 2) && P && /* @__PURE__ */ s.jsxs(
                D.div,
                {
                  initial: { opacity: 0, y: 20 },
                  animate: { opacity: 1, y: 0 },
                  transition: { delay: 0.3 },
                  className: "absolute bottom-[9px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-4",
                  children: [
                    /* @__PURE__ */ s.jsx(
                      Q,
                      {
                        onClick: () => be(P.id, "in-progress"),
                        size: "sm",
                        className: `h-9 text-sm w-20 font-medium transition-all duration-200 shadow-lg ${P.status === "in-progress" ? "bg-slate-700 hover:bg-slate-800 text-white" : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400"}`,
                        children: P.status === "in-progress" ? "Removed" : "Remove"
                      }
                    ),
                    /* @__PURE__ */ s.jsx(
                      Q,
                      {
                        onClick: () => be(P.id, "completed"),
                        size: "sm",
                        className: `h-9 text-sm w-20 font-medium transition-all duration-200 shadow-lg ${P.status === "completed" ? "bg-slate-800 hover:bg-slate-900 text-white" : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400"}`,
                        children: P.status === "completed" ? "Kept" : "Keep"
                      }
                    )
                  ]
                }
              )
            ]
          }
        ),
        P && O.length > 0 && /* @__PURE__ */ s.jsx(
          "div",
          {
            className: "bg-white/95 backdrop-blur-md border-t border-white/30 shadow-lg shadow-slate-900/10 flex flex-col",
            style: {
              height: `calc(70vh - ${e.id === 1 || e.id === 2 ? "180px" : "80px"})`,
              minHeight: "300px"
            },
            children: /* @__PURE__ */ s.jsx(mt, { mode: "wait", children: /* @__PURE__ */ s.jsxs(
              D.div,
              {
                initial: { opacity: 0, y: 20 },
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, y: -20 },
                transition: { duration: 0.3 },
                className: "flex-1 flex flex-col min-h-0",
                children: [
                  /* @__PURE__ */ s.jsx("div", { className: "flex-shrink-0 p-4 pb-2.5 border-b border-slate-150", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "flex-shrink-0", children: /* @__PURE__ */ s.jsx("div", { className: `w-10 h-10 rounded-lg flex items-center justify-center ${pe(P.category)}`, children: me(P.status) }) }),
                    /* @__PURE__ */ s.jsxs("div", { className: "flex-1 min-w-0", children: [
                      /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
                        /* @__PURE__ */ s.jsx("h4", { className: "font-semibold text-slate-900 leading-tight", children: P.title || "Untitled" }),
                        /* @__PURE__ */ s.jsxs(
                          D.div,
                          {
                            initial: { opacity: 0, scale: 0.95 },
                            animate: { opacity: 1, scale: 1 },
                            onMouseEnter: () => {
                              i && i(!0);
                            },
                            onMouseLeave: () => {
                              i && i(!1);
                            },
                            className: "group relative flex items-center gap-1.5 cursor-pointer transition-all duration-200 hover:bg-slate-50/80 px-2 py-1 rounded-md",
                            whileHover: { scale: 1.01 },
                            children: [
                              /* @__PURE__ */ s.jsx(
                                D.div,
                                {
                                  animate: {
                                    rotate: [0, 3, -3, 0]
                                  },
                                  transition: {
                                    rotate: { duration: 6, repeat: 1 / 0, ease: "easeInOut" }
                                  },
                                  children: /* @__PURE__ */ s.jsx(Jr, { size: 12, className: "text-slate-400 group-hover:text-blue-500 transition-colors duration-200" })
                                }
                              ),
                              /* @__PURE__ */ s.jsx("span", { className: "text-xs text-slate-500 group-hover:text-blue-600 transition-colors duration-200 select-none", children: "Why was this suggested?" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-slate-800/90 text-white text-xs rounded whitespace-nowrap shadow-md pointer-events-none z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-sm", children: [
                                "Show evidence highlights",
                                /* @__PURE__ */ s.jsx("div", { className: "absolute top-full left-1/2 -translate-x-1/2", style: {
                                  width: 0,
                                  height: 0,
                                  borderLeft: "3px solid transparent",
                                  borderRight: "3px solid transparent",
                                  borderTop: "3px solid rgba(30, 41, 59, 0.9)"
                                } })
                              ] }),
                              /* @__PURE__ */ s.jsx(
                                D.div,
                                {
                                  className: "absolute inset-0 rounded-md border border-blue-200/0 group-hover:border-blue-200/60 transition-colors duration-200 pointer-events-none",
                                  animate: {
                                    boxShadow: [
                                      "0 0 0 0 rgba(59, 130, 246, 0)",
                                      "0 0 0 1px rgba(59, 130, 246, 0.1)",
                                      "0 0 0 0 rgba(59, 130, 246, 0)"
                                    ]
                                  },
                                  transition: {
                                    duration: 3,
                                    repeat: 1 / 0,
                                    ease: "easeInOut"
                                  }
                                }
                              )
                            ]
                          }
                        )
                      ] }),
                      /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 text-xs", children: [
                        /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-1.5", children: [
                          de(P.priority),
                          /* @__PURE__ */ s.jsxs("span", { className: "text-slate-600 capitalize", children: [
                            P.priority || "low",
                            " Priority"
                          ] })
                        ] }),
                        /* @__PURE__ */ s.jsx("span", { className: "text-slate-300", children: "•" }),
                        /* @__PURE__ */ s.jsx(Be, { variant: "secondary", className: "text-xs px-2 py-0.5", children: P.category || "unknown" }),
                        /* @__PURE__ */ s.jsx("span", { className: "text-slate-300", children: "•" }),
                        /* @__PURE__ */ s.jsx("span", { className: "text-slate-500 text-xs", children: e.id === 0 ? "Documentation Gap" : e.id === 0 ? "Current Code" : e.id === 2 ? "AI Suggestion" : "Review Item" })
                      ] })
                    ] }),
                    !(e.id === 1 || e.id === 2) && /* @__PURE__ */ s.jsx(
                      Q,
                      {
                        onClick: () => be(P.id, P.status === "completed" ? "pending" : "completed"),
                        variant: P.status === "completed" ? "default" : "outline",
                        size: "sm",
                        className: "h-8 flex-shrink-0 text-xs px-3",
                        children: P.status === "completed" ? "✓ Done" : "Mark Done"
                      }
                    )
                  ] }) }),
                  /* @__PURE__ */ s.jsx(
                    "div",
                    {
                      className: `overflow-y-auto px-4 ${e.id === 1 || e.id === 2 ? "code-step-scroll pb-24" : "scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent hover:scrollbar-thumb-slate-400 pb-4"}`,
                      style: {
                        height: `calc(70vh - 170px - ${e.id === 1 || e.id === 2 ? "180px" : "80px"})`,
                        minHeight: "180px"
                      },
                      children: /* @__PURE__ */ s.jsxs("div", { className: `space-y-4 pr-2 ${e.id === 1 || e.id === 2 ? "pt-2" : ""}`, children: [
                        e.stepType === "selected" && /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-400 to-emerald-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(dn, { size: 16, className: "text-emerald-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Code Validation Status" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-2 gap-3 mb-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-slate-50 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Still Valid" }),
                                    /* @__PURE__ */ s.jsx("div", { className: `font-semibold ${P.stillValid ? "text-emerald-600" : "text-red-600"}`, children: P.stillValid ? "Yes" : "Needs Review" })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-slate-50 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500 mb-1", children: "AI Confidence" }),
                                    /* @__PURE__ */ s.jsxs("div", { className: `font-semibold ${P.confidence >= 90 ? "text-emerald-600" : P.confidence >= 75 ? "text-amber-600" : "text-red-600"}`, children: [
                                      P.confidence,
                                      "%"
                                    ] })
                                  ] })
                                ] }),
                                /* @__PURE__ */ s.jsxs("div", { className: "bg-slate-50 rounded-lg p-3 mb-3", children: [
                                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Documentation Support" }),
                                  /* @__PURE__ */ s.jsxs("div", { className: `font-semibold capitalize ${P.docSupport === "strong" ? "text-emerald-600" : P.docSupport === "moderate" ? "text-amber-600" : "text-red-600"}`, children: [
                                    P.docSupport,
                                    " Evidence"
                                  ] })
                                ] }),
                                /* @__PURE__ */ s.jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-3", children: [
                                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Last Validation" }),
                                  /* @__PURE__ */ s.jsx("div", { className: "font-medium text-blue-700 text-sm", children: "Current encounter" }),
                                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-blue-600 mt-1", children: "Validated against ICD-10-CM guidelines and clinical documentation" })
                                ] })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-indigo-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(gr, { size: 16, className: "text-blue-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Clinical Analysis" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-blue-800 text-sm mb-1", children: "Primary Diagnosis Rationale" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-blue-700 leading-relaxed", children: P.title.includes("I25.10") ? "Atherosclerotic heart disease is supported by patient's clinical presentation, risk factors including 30-year smoking history, and cardiac evaluation recommendations. This aligns with documented chest pain and cardiovascular risk assessment needs." : P.title.includes("Z87.891") ? "Personal history of nicotine dependence is well-documented with specific smoking history (1 pack per day for 30 years) and smoking cessation counseling provided. This supports cardiovascular risk stratification." : P.title.includes("E78.5") ? "Hyperlipidemia diagnosis is supported by planned lipid profile testing and basic metabolic panel. This condition commonly co-occurs with cardiovascular risk factors and requires ongoing monitoring." : P.title.includes("I10") ? "Essential hypertension diagnosis is supported by cardiovascular examination findings including regular rate and rhythm assessment. Blood pressure monitoring is standard for cardiovascular risk evaluation." : "Clinical presentation and documented findings support this diagnostic code selection." })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-slate-50 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-700 text-sm mb-2", children: "Supporting Clinical Indicators" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "space-y-1", children: P.title.includes("I25.10") ? /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Chest pain with characteristic presentation" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• 30-year smoking history (major risk factor)" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Age-appropriate cardiovascular screening" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Planned cardiac evaluation and stress testing" })
                                    ] }) : P.title.includes("Z87.891") ? /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Documented smoking history (1 pack/day × 30 years)" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Smoking cessation counseling provided" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Cardiovascular risk factor documentation" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Relevant to current chest pain evaluation" })
                                    ] }) : P.title.includes("E78.5") ? /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Lipid profile testing ordered" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Basic metabolic panel planned" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Cardiovascular risk assessment indicated" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Common comorbidity with heart disease" })
                                    ] }) : /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Cardiovascular examination documented" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Regular rate and rhythm noted" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• No murmurs appreciated" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Appropriate for cardiovascular risk stratification" })
                                    ] }) })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] }),
                          P.gaps && P.gaps.length > 0 && /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-400 to-orange-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(br, { size: 16, className: "text-amber-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Documentation Gaps" }),
                                /* @__PURE__ */ s.jsx("div", { className: "space-y-2 mb-3", children: P.gaps.map((w, B) => /* @__PURE__ */ s.jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded-lg p-3", children: [
                                  /* @__PURE__ */ s.jsx("div", { className: "font-medium text-amber-800 text-sm mb-1", children: w }),
                                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-600", children: "Consider asking patient for clarification during encounter" })
                                ] }, B)) }),
                                /* @__PURE__ */ s.jsxs("div", { className: "bg-orange-50 border border-orange-200 rounded-lg p-3", children: [
                                  /* @__PURE__ */ s.jsx("div", { className: "font-medium text-orange-800 text-sm mb-2", children: "Recommended Actions" }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "space-y-1", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-orange-700", children: "• Review patient questionnaire responses" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-orange-700", children: "• Verify smoking cessation timeline and current status" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-orange-700", children: "• Document specific pack-year calculation if available" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-orange-700", children: "• Consider social history documentation enhancement" })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-400 to-emerald-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(vr, { size: 16, className: "text-green-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Billing & Compliance Analysis" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
                                    /* @__PURE__ */ s.jsxs("div", { className: "bg-green-50 rounded-lg p-3", children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Billing Impact" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "font-semibold text-green-700", children: P.codeType === "CPT" ? "Billable" : "Diagnostic" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-green-600 mt-1", children: "Supports medical necessity" })
                                    ] }),
                                    /* @__PURE__ */ s.jsxs("div", { className: "bg-blue-50 rounded-lg p-3", children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Risk Score" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "font-semibold text-blue-700", children: P.confidence >= 90 ? "Low" : P.confidence >= 75 ? "Medium" : "High" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-blue-600 mt-1", children: "Audit risk assessment" })
                                    ] })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-slate-50 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-700 text-sm mb-2", children: "Compliance Notes" }),
                                    /* @__PURE__ */ s.jsxs("div", { className: "space-y-1", children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• ICD-10-CM code validates against current guidelines" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Documentation supports medical necessity requirements" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• Code specificity appropriate for reported symptoms" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600", children: "• No obvious coding conflicts identified" })
                                    ] })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-400 to-violet-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(Os, { size: 16, className: "text-purple-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Supporting Evidence Review" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-purple-50 border border-purple-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-purple-800 text-sm mb-2", children: "Documentation Evidence" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "space-y-1", children: P.evidence?.map((w, B) => /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-purple-700 flex items-start gap-2", children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "w-1 h-1 bg-purple-500 rounded-full mt-1.5 flex-shrink-0" }),
                                      /* @__PURE__ */ s.jsxs("span", { children: [
                                        '"',
                                        w,
                                        '" - Found in clinical documentation'
                                      ] })
                                    ] }, B)) || /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "Multiple supporting elements found in clinical note" }) })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-indigo-50 border border-indigo-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-indigo-800 text-sm mb-1", children: "Quality Metrics" }),
                                    /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-3 gap-2 mt-2", children: [
                                      /* @__PURE__ */ s.jsxs("div", { className: "text-center", children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-600", children: "Specificity" }),
                                        /* @__PURE__ */ s.jsx("div", { className: "font-semibold text-indigo-800", children: P.confidence >= 90 ? "High" : P.confidence >= 75 ? "Good" : "Fair" })
                                      ] }),
                                      /* @__PURE__ */ s.jsxs("div", { className: "text-center", children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-600", children: "Accuracy" }),
                                        /* @__PURE__ */ s.jsx("div", { className: "font-semibold text-indigo-800", children: P.docSupport === "strong" ? "High" : P.docSupport === "moderate" ? "Good" : "Fair" })
                                      ] }),
                                      /* @__PURE__ */ s.jsxs("div", { className: "text-center", children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-600", children: "Completeness" }),
                                        /* @__PURE__ */ s.jsx("div", { className: "font-semibold text-indigo-800", children: P.gaps?.length ? "Partial" : "Complete" })
                                      ] })
                                    ] })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-rose-400 to-pink-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(I0, { size: 16, className: "text-rose-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Clinical Decision Support" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-rose-50 border border-rose-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-rose-800 text-sm mb-1", children: "Care Coordination Impact" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-rose-700 leading-relaxed", children: "This diagnostic code enhances care coordination by providing clear communication to consulting physicians, specialists, and other healthcare team members about the patient's documented conditions and risk factors." })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-red-50 border border-red-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-red-800 text-sm mb-2", children: "Recommended Follow-up" }),
                                    /* @__PURE__ */ s.jsxs("div", { className: "space-y-1", children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-red-700", children: "• Schedule cardiology consultation if symptoms persist" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-red-700", children: "• Monitor response to smoking cessation interventions" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-red-700", children: "• Review lipid management and cardiovascular risk factors" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-red-700", children: "• Consider cardiac stress testing based on clinical judgment" })
                                    ] })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] })
                        ] }),
                        e.stepType === "suggested" && /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-violet-400 to-purple-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(mn, { size: 16, className: "text-violet-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "AI Recommendation Analysis" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "bg-violet-50 border border-violet-200 rounded-lg p-3 mb-3", children: [
                                  /* @__PURE__ */ s.jsx("div", { className: "text-sm text-violet-800 leading-relaxed mb-2", children: P.aiReasoning || "AI analysis suggests this code based on documented clinical findings." }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-violet-600 font-medium", children: [
                                    "Recommendation Strength: ",
                                    P.confidence >= 90 ? "Very High" : P.confidence >= 75 ? "High" : "Moderate"
                                  ] })
                                ] }),
                                /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-2 gap-3 mb-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-slate-50 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Confidence Score" }),
                                    /* @__PURE__ */ s.jsxs("div", { className: `font-semibold ${P.confidence >= 90 ? "text-emerald-600" : P.confidence >= 75 ? "text-amber-600" : "text-red-600"}`, children: [
                                      P.confidence,
                                      "%"
                                    ] })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-slate-50 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500 mb-1", children: "Suggested By" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "font-semibold text-violet-600 text-sm", children: P.suggestedBy })
                                  ] })
                                ] }),
                                /* @__PURE__ */ s.jsxs("div", { className: "bg-purple-50 border border-purple-200 rounded-lg p-3", children: [
                                  /* @__PURE__ */ s.jsx("div", { className: "font-medium text-purple-800 text-sm mb-2", children: "Algorithm Insights" }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "space-y-1", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• Natural language processing identified key clinical indicators" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• Cross-referenced with established coding guidelines" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• Validated against similar patient presentations" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• Checked for documentation completeness requirements" })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-indigo-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(gr, { size: 16, className: "text-blue-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Clinical Rationale" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-blue-800 text-sm mb-1", children: "Supporting Clinical Evidence" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-blue-700 leading-relaxed", children: P.title.includes("Z13.6") ? "Patient demographics (age 65) and documented cardiovascular risk factors indicate appropriate screening for cardiovascular disorders. Current chest pain presentation supports comprehensive cardiovascular assessment including screening protocols." : P.title.includes("F17.210") ? "Documented current smoking behavior (1 pack per day for 30 years) meets criteria for active nicotine dependence rather than just historical documentation. This supports more specific coding for current addiction treatment and billing." : P.title.includes("Z68.36") ? "BMI calculation from documented height and weight measurements falls within the specified range. BMI documentation supports cardiovascular risk stratification and enables quality measure reporting for population health management." : P.title.includes("99213") ? "Documentation complexity analysis indicates moderate medical decision making with multiple diagnoses addressed, diagnostic testing ordered, and treatment plans established. This supports the suggested evaluation and management level." : P.title.includes("80061") ? "Lipid panel testing is explicitly mentioned in the treatment plan and aligns with cardiovascular risk assessment protocols. This captures the diagnostic testing component for comprehensive billing." : P.title.includes("93000") ? "ECG testing is specifically documented in the assessment and plan for cardiac evaluation. This diagnostic procedure should be coded to ensure complete capture of ordered services and proper billing documentation." : "Clinical documentation supports the addition of this code based on documented findings and treatment plans." })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-indigo-50 border border-indigo-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-indigo-800 text-sm mb-2", children: "Risk-Benefit Analysis" }),
                                    /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
                                      /* @__PURE__ */ s.jsxs("div", { children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-600 font-medium mb-1", children: "Benefits" }),
                                        /* @__PURE__ */ s.jsxs("div", { className: "space-y-1", children: [
                                          /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-700", children: "• Improved diagnostic specificity" }),
                                          /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-700", children: "• Enhanced billing accuracy" }),
                                          /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-700", children: "• Better care coordination" })
                                        ] })
                                      ] }),
                                      /* @__PURE__ */ s.jsxs("div", { children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-600 font-medium mb-1", children: "Considerations" }),
                                        /* @__PURE__ */ s.jsxs("div", { className: "space-y-1", children: [
                                          /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-700", children: "• Documentation review needed" }),
                                          /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-700", children: "• Clinical judgment required" }),
                                          /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-700", children: "• Coding guideline compliance" })
                                        ] })
                                      ] })
                                    ] })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-400 to-emerald-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(vr, { size: 16, className: "text-green-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Multi-Dimensional Impact Assessment" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-green-50 border border-green-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-green-800 text-sm mb-1", children: "Clinical Impact" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-green-700 leading-relaxed", children: P.category === "diagnosis" ? "Improves diagnostic specificity and care planning by providing more precise condition documentation that guides treatment decisions and specialist referrals." : P.category === "screening" ? "Supports preventive care and risk assessment protocols while enabling population health management and quality measure reporting." : P.category === "procedure" ? "Ensures proper procedure billing and tracking while supporting quality metrics for procedural outcomes and follow-up care coordination." : P.category === "evaluation" ? "Accurately reflects the complexity of medical decision-making and time invested in patient care evaluation and management." : "Enhances overall documentation quality and supports comprehensive patient care management." })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-emerald-50 border border-emerald-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-emerald-800 text-sm mb-1", children: "Financial Impact" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-emerald-700 leading-relaxed", children: P.codeType === "CPT" ? "Captures billable procedures and services that might otherwise go uncompensated, improving practice revenue while ensuring accurate documentation of services provided." : "Supports medical necessity and accurate reimbursement by providing specific diagnostic justification for treatments, procedures, and follow-up care requirements." })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-teal-50 border border-teal-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-teal-800 text-sm mb-1", children: "Quality Metrics Impact" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-teal-700 leading-relaxed", children: "Supports quality reporting requirements, population health initiatives, and risk adjustment models used by payers and quality organizations for performance measurement and benchmarking." })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-400 to-yellow-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(Os, { size: 16, className: "text-amber-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Documentation Requirements" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-amber-800 text-sm mb-2", children: "Required Documentation Elements" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "space-y-1", children: P.title.includes("Z13.6") ? /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Patient age and cardiovascular risk factors documented" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Screening rationale clearly stated in assessment" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Preventive care context established" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Follow-up screening schedule documented" })
                                    ] }) : P.title.includes("F17.210") ? /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Current smoking status and frequency documented" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Duration of smoking history specified" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Nicotine dependence symptoms or impact noted" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Treatment or counseling interventions documented" })
                                    ] }) : P.title.includes("Z68.36") ? /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Height and weight measurements documented" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• BMI calculation recorded (36.0-36.9 range)" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Adult age verification in documentation" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Clinical significance of BMI addressed" })
                                    ] }) : /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Service complexity appropriately documented" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Medical decision-making rationale clear" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Time or complexity justification present" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-amber-700", children: "• Clinical indicators support code selection" })
                                    ] }) })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-yellow-50 border border-yellow-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-yellow-800 text-sm mb-2", children: "Compliance Checklist" }),
                                    /* @__PURE__ */ s.jsxs("div", { className: "space-y-1", children: [
                                      /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-yellow-700 flex items-center gap-2", children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "w-3 h-3 bg-green-500 rounded-sm flex items-center justify-center", children: /* @__PURE__ */ s.jsx(_e, { size: 8, className: "text-white" }) }),
                                        "Clinical documentation supports code selection"
                                      ] }),
                                      /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-yellow-700 flex items-center gap-2", children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "w-3 h-3 bg-green-500 rounded-sm flex items-center justify-center", children: /* @__PURE__ */ s.jsx(_e, { size: 8, className: "text-white" }) }),
                                        "Code specificity matches documented findings"
                                      ] }),
                                      /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-yellow-700 flex items-center gap-2", children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "w-3 h-3 bg-amber-500 rounded-sm flex items-center justify-center", children: /* @__PURE__ */ s.jsx(br, { size: 8, className: "text-white" }) }),
                                        "Provider review and approval needed"
                                      ] }),
                                      /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-yellow-700 flex items-center gap-2", children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "w-3 h-3 bg-blue-500 rounded-sm flex items-center justify-center", children: /* @__PURE__ */ s.jsx(Jr, { size: 8, className: "text-white" }) }),
                                        "Consider additional supporting documentation"
                                      ] })
                                    ] })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-400 to-indigo-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(No, { size: 16, className: "text-purple-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Coding Guidelines Reference" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-purple-50 border border-purple-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-purple-800 text-sm mb-2", children: "Applicable Guidelines" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "space-y-1", children: P.codeType === "CPT" ? /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• CPT Professional Edition current year guidelines" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• CMS Evaluation and Management documentation requirements" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• Medical necessity and billing compliance standards" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• Local coverage determination (LCD) requirements" })
                                    ] }) : /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• ICD-10-CM Official Guidelines for Coding and Reporting" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• WHO International Classification of Diseases standards" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• CMS ICD-10-CM and GEMs mapping requirements" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-700", children: "• Official coding clinic guidance and updates" })
                                    ] }) })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-indigo-50 border border-indigo-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-indigo-800 text-sm mb-2", children: "Best Practice Recommendations" }),
                                    /* @__PURE__ */ s.jsxs("div", { className: "space-y-1", children: [
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-700", children: "• Review code selection with supervising physician" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-700", children: "• Verify documentation completeness before finalizing" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-700", children: "• Consider additional specificity if clinically supported" }),
                                      /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-700", children: "• Document rationale for AI-suggested code acceptance" })
                                    ] })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-rose-400 to-pink-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(dn, { size: 16, className: "text-rose-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-2", children: "Quality Assurance Review" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-rose-50 border border-rose-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-rose-800 text-sm mb-2", children: "Audit Trail Information" }),
                                    /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
                                      /* @__PURE__ */ s.jsxs("div", { children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-rose-600 mb-1", children: "Suggestion Generated" }),
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-rose-700 font-medium", children: "Current encounter" })
                                      ] }),
                                      /* @__PURE__ */ s.jsxs("div", { children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-rose-600 mb-1", children: "Algorithm Version" }),
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-rose-700 font-medium", children: "v2024.1.3" })
                                      ] }),
                                      /* @__PURE__ */ s.jsxs("div", { children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-rose-600 mb-1", children: "Review Status" }),
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-rose-700 font-medium", children: "Pending physician approval" })
                                      ] }),
                                      /* @__PURE__ */ s.jsxs("div", { children: [
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-rose-600 mb-1", children: "Risk Score" }),
                                        /* @__PURE__ */ s.jsx("div", { className: "text-xs text-rose-700 font-medium", children: P.confidence >= 90 ? "Low" : P.confidence >= 75 ? "Medium" : "High" })
                                      ] })
                                    ] })
                                  ] }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "bg-pink-50 border border-pink-200 rounded-lg p-3", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-pink-800 text-sm mb-1", children: "Final Recommendation" }),
                                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-pink-700 leading-relaxed", children: P.confidence >= 90 ? "Strong recommendation for code inclusion based on comprehensive documentation analysis. Clinical review advised but code appears well-supported." : P.confidence >= 75 ? "Moderate recommendation for code inclusion. Recommend clinical review to validate appropriateness and ensure documentation completeness." : "Weak recommendation requires thorough clinical review. Consider if additional documentation or clarification is needed before code acceptance." })
                                  ] })
                                ] })
                              ] })
                            ] })
                          ] })
                        ] }),
                        !e.stepType && /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-rose-400 to-rose-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(ix, { size: 16, className: "text-rose-500 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-1.5", children: "Why This Matters" }),
                                /* @__PURE__ */ s.jsx("p", { className: "text-slate-600 leading-snug text-sm", children: P.why || "No information available" })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-indigo-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(Ln, { size: 16, className: "text-blue-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-1.5", children: "How to Address" }),
                                /* @__PURE__ */ s.jsx("p", { className: "text-slate-600 leading-snug text-sm", children: P.how || "No information available" })
                              ] })
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "relative pl-5", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-400 to-emerald-300 rounded-full" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                              /* @__PURE__ */ s.jsx(F0, { size: 16, className: "text-emerald-600 mt-1 flex-shrink-0" }),
                              /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
                                /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800 mb-1.5", children: "Details & Next Steps" }),
                                /* @__PURE__ */ s.jsxs("div", { className: "space-y-1.5", children: [
                                  /* @__PURE__ */ s.jsx("p", { className: "text-slate-700 font-medium text-sm", children: P.title || "Untitled" }),
                                  /* @__PURE__ */ s.jsx("p", { className: "text-slate-600 leading-snug text-sm italic", children: P.what || "No information available" })
                                ] })
                              ] })
                            ] })
                          ] })
                        ] })
                      ] })
                    }
                  )
                ]
              },
              P.id
            ) })
          }
        ),
        O.length === 0 && /* @__PURE__ */ s.jsx(
          "div",
          {
            className: "bg-white/95 backdrop-blur-md border-t border-white/30 shadow-lg shadow-slate-900/10 flex items-center justify-center",
            style: {
              height: `calc(70vh - ${e.id === 1 || e.id === 2 ? "180px" : "80px"})`,
              minHeight: "300px"
            },
            children: /* @__PURE__ */ s.jsxs("div", { className: "text-center text-slate-500 p-4", children: [
              /* @__PURE__ */ s.jsx(_e, { size: 32, className: "text-emerald-500 mx-auto mb-3" }),
              /* @__PURE__ */ s.jsx("h4", { className: "font-semibold text-slate-800 mb-2", children: "All items completed" }),
              /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "Great job! All items in this step have been addressed." })
            ] })
          }
        ),
        (e.id === 1 || e.id === 2) && /* @__PURE__ */ s.jsx(
          D.div,
          {
            initial: { y: 20, opacity: 0 },
            animate: { y: 0, opacity: 1 },
            transition: { delay: 0.3 },
            className: "fixed bottom-0 left-1/2 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-white/30 p-4 shadow-lg shadow-slate-900/10",
            style: {
              boxShadow: "0 -4px 16px rgba(15, 23, 42, 0.08), 0 -1px 4px rgba(15, 23, 42, 0.04)"
            },
            children: /* @__PURE__ */ s.jsxs("div", { className: "flex justify-between items-center", children: [
              /* @__PURE__ */ s.jsxs(
                Q,
                {
                  variant: "outline",
                  onClick: n,
                  disabled: e.id <= 1,
                  className: "flex items-center gap-2 h-11 px-5",
                  size: "sm",
                  children: [
                    /* @__PURE__ */ s.jsx(cn, { size: 16 }),
                    "Previous Step"
                  ]
                }
              ),
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-500", children: [
                /* @__PURE__ */ s.jsxs("span", { children: [
                  "Step ",
                  e.id,
                  " of 6"
                ] }),
                /* @__PURE__ */ s.jsx("div", { className: "w-1 h-1 bg-slate-300 rounded-full" }),
                /* @__PURE__ */ s.jsx("span", { children: e.title })
              ] }),
              /* @__PURE__ */ s.jsxs(
                Q,
                {
                  onClick: t,
                  disabled: e.id >= 6,
                  className: "flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white h-11 px-5",
                  size: "sm",
                  children: [
                    "Next Step",
                    /* @__PURE__ */ s.jsx(Lt, { size: 16 })
                  ]
                }
              )
            ] })
          }
        ),
        !(e.id === 1 || e.id === 2) && /* @__PURE__ */ s.jsx(
          D.div,
          {
            initial: { y: 20, opacity: 0 },
            animate: { y: 0, opacity: 1 },
            transition: { delay: 0.3 },
            className: "absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-md border border-white/30 rounded-xl p-3 shadow-lg shadow-slate-900/10 z-30",
            children: /* @__PURE__ */ s.jsxs("div", { className: "flex justify-between items-center", children: [
              /* @__PURE__ */ s.jsxs(
                Q,
                {
                  variant: "outline",
                  onClick: n,
                  disabled: e.id <= 1,
                  className: "flex items-center gap-2 h-9 px-4",
                  size: "sm",
                  children: [
                    /* @__PURE__ */ s.jsx(cn, { size: 16 }),
                    "Previous Step"
                  ]
                }
              ),
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-500", children: [
                /* @__PURE__ */ s.jsxs("span", { children: [
                  "Step ",
                  e.id,
                  " of 6"
                ] }),
                /* @__PURE__ */ s.jsx("div", { className: "w-1 h-1 bg-slate-300 rounded-full" }),
                /* @__PURE__ */ s.jsx("span", { children: e.title })
              ] }),
              /* @__PURE__ */ s.jsxs(
                Q,
                {
                  onClick: t,
                  disabled: e.id >= 6,
                  className: "flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white h-9 px-4",
                  size: "sm",
                  children: [
                    "Next Step",
                    /* @__PURE__ */ s.jsx(Lt, { size: 16 })
                  ]
                }
              )
            ] })
          }
        ),
        /* @__PURE__ */ s.jsx(
          pg,
          {
            questions: a,
            isOpen: S,
            onClose: () => T(!1),
            onUpdateQuestions: o || (() => {
            }),
            onInsertToNote: (w, B) => {
              u && u(w), console.log("Inserting text to note:", w, "for question:", B);
            }
          }
        ),
        /* @__PURE__ */ s.jsx(mt, { children: N && /* @__PURE__ */ s.jsxs(
          D.div,
          {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 },
            className: "fixed inset-0 z-50",
            onClick: () => j(!1),
            children: [
              /* @__PURE__ */ s.jsx("div", { className: "absolute inset-0 bg-black/10 backdrop-blur-sm" }),
              /* @__PURE__ */ s.jsx(
                D.div,
                {
                  initial: { opacity: 0, scale: 0.96, y: 20 },
                  animate: { opacity: 1, scale: 1, y: 0 },
                  exit: { opacity: 0, scale: 0.96, y: 20 },
                  transition: { duration: 0.2, ease: "easeOut" },
                  className: "absolute top-1/2 left-[75%] -translate-x-1/2 -translate-y-1/2 w-[30vw] h-[60vh] bg-white rounded-xl shadow-2xl border border-slate-200/50 overflow-hidden",
                  onClick: (w) => w.stopPropagation(),
                  children: /* @__PURE__ */ s.jsxs("div", { className: "flex h-full", children: [
                    /* @__PURE__ */ s.jsxs(
                      D.div,
                      {
                        initial: { opacity: 0, x: -20 },
                        animate: { opacity: 1, x: 0 },
                        transition: { delay: 0.1 },
                        className: "w-32 bg-slate-50/80 border-r border-slate-200/50 flex flex-col",
                        children: [
                          /* @__PURE__ */ s.jsxs("div", { className: "p-3 border-b border-slate-200/50", children: [
                            /* @__PURE__ */ s.jsx("div", { className: "text-xs font-medium text-slate-600 mb-3", children: "Filter Items" }),
                            /* @__PURE__ */ s.jsxs("div", { className: "space-y-1", children: [
                              /* @__PURE__ */ s.jsx(
                                "button",
                                {
                                  onClick: () => A(E === "priority" ? null : "priority"),
                                  className: `w-full text-left px-2 py-2 text-xs rounded-lg transition-all ${E === "priority" ? "bg-red-100 text-red-700 font-medium shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-800 hover:shadow-sm"}`,
                                  children: "Priority"
                                }
                              ),
                              /* @__PURE__ */ s.jsx(
                                "button",
                                {
                                  onClick: () => A(E === "category" ? null : "category"),
                                  className: `w-full text-left px-2 py-2 text-xs rounded-lg transition-all ${E === "category" ? "bg-blue-100 text-blue-700 font-medium shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-800 hover:shadow-sm"}`,
                                  children: "Category"
                                }
                              ),
                              /* @__PURE__ */ s.jsx(
                                "button",
                                {
                                  onClick: () => A(E === "status" ? null : "status"),
                                  className: `w-full text-left px-2 py-2 text-xs rounded-lg transition-all ${E === "status" ? "bg-emerald-100 text-emerald-700 font-medium shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-800 hover:shadow-sm"}`,
                                  children: "Status"
                                }
                              )
                            ] })
                          ] }),
                          /* @__PURE__ */ s.jsxs("div", { className: "flex-1 p-3 text-xs text-slate-500 space-y-2", children: [
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between", children: [
                              /* @__PURE__ */ s.jsx("span", { children: "Total Items" }),
                              /* @__PURE__ */ s.jsx("span", { className: "font-medium text-slate-700", children: h.length })
                            ] }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between", children: [
                              /* @__PURE__ */ s.jsx("span", { children: "Filtered" }),
                              /* @__PURE__ */ s.jsx("span", { className: "font-medium text-slate-700", children: O.length })
                            ] }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between", children: [
                              /* @__PURE__ */ s.jsx("span", { children: "Completed" }),
                              /* @__PURE__ */ s.jsx("span", { className: "font-medium text-emerald-600", children: h.filter((w) => w && w.status === "completed").length })
                            ] }),
                            E && /* @__PURE__ */ s.jsx(
                              "button",
                              {
                                onClick: () => A(null),
                                className: "w-full mt-3 text-xs text-slate-500 hover:text-slate-700 py-1 px-2 hover:bg-white rounded transition-colors",
                                children: "Clear Filter"
                              }
                            )
                          ] })
                        ]
                      }
                    ),
                    /* @__PURE__ */ s.jsxs("div", { className: "flex-1 flex flex-col", children: [
                      /* @__PURE__ */ s.jsxs(
                        D.div,
                        {
                          initial: { opacity: 0, y: -10 },
                          animate: { opacity: 1, y: 0 },
                          transition: { delay: 0.15 },
                          className: "flex items-center justify-between p-4 border-b border-slate-100/50 bg-white/80 backdrop-blur-sm",
                          children: [
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                              /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center", children: /* @__PURE__ */ s.jsx(Co, { size: 14, className: "text-white" }) }),
                              /* @__PURE__ */ s.jsxs("div", { children: [
                                /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Items Overview" }),
                                /* @__PURE__ */ s.jsxs("p", { className: "text-sm text-slate-500", children: [
                                  O.length,
                                  " of ",
                                  h.length,
                                  " items",
                                  E && ` • Grouped by ${E}`
                                ] })
                              ] })
                            ] }),
                            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                              E && /* @__PURE__ */ s.jsx("span", { className: `text-xs px-3 py-1 rounded-full font-medium ${E === "priority" ? "bg-red-100 text-red-700" : E === "category" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`, children: E }),
                              /* @__PURE__ */ s.jsx(
                                "button",
                                {
                                  onClick: () => j(!1),
                                  className: "w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors",
                                  children: /* @__PURE__ */ s.jsx(Lt, { size: 16, className: "text-slate-400" })
                                }
                              )
                            ] })
                          ]
                        }
                      ),
                      /* @__PURE__ */ s.jsx(
                        D.div,
                        {
                          initial: { opacity: 0 },
                          animate: { opacity: 1 },
                          transition: { delay: 0.2 },
                          className: "flex-1 overflow-y-auto",
                          children: E ? (
                            // Grouped view
                            /* @__PURE__ */ s.jsx("div", { className: "p-4 space-y-4", children: Object.entries(re(E)).map(([w, B], W) => /* @__PURE__ */ s.jsxs(
                              D.div,
                              {
                                initial: { opacity: 0, y: 10 },
                                animate: { opacity: 1, y: 0 },
                                transition: { delay: W * 0.1 },
                                className: "bg-gradient-to-r from-slate-50/50 to-white rounded-lg border border-slate-200/50 overflow-hidden",
                                children: [
                                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-slate-50/80 to-white border-b border-slate-200/30", children: [
                                    /* @__PURE__ */ s.jsx("div", { className: `w-3 h-3 rounded-full ${E === "priority" ? w === "high" ? "bg-red-400" : w === "medium" ? "bg-amber-400" : "bg-green-400" : E === "category" ? w === "ICD-10" ? "bg-blue-400" : w === "CPT" ? "bg-green-400" : w === "Public Health" ? "bg-purple-400" : "bg-slate-400" : w === "completed" ? "bg-emerald-400" : w === "in-progress" ? "bg-amber-400" : "bg-slate-400"}` }),
                                    /* @__PURE__ */ s.jsx("h4", { className: "font-medium text-slate-800 capitalize", children: w.replace("-", " ") }),
                                    /* @__PURE__ */ s.jsxs("span", { className: "text-sm text-slate-500", children: [
                                      "(",
                                      B.length,
                                      " item",
                                      B.length !== 1 ? "s" : "",
                                      ")"
                                    ] })
                                  ] }),
                                  /* @__PURE__ */ s.jsx("div", { className: "p-2 space-y-1", children: B.map((G, xe) => /* @__PURE__ */ s.jsx(
                                    D.button,
                                    {
                                      initial: { opacity: 0, x: -10 },
                                      animate: { opacity: 1, x: 0 },
                                      transition: { delay: W * 0.1 + xe * 0.03 },
                                      onClick: () => {
                                        const oe = h.findIndex((ee) => ee.id === G.id);
                                        m(oe), g(!1), j(!1);
                                      },
                                      className: "w-full text-left p-3 rounded-lg hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200/50",
                                      children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                                        /* @__PURE__ */ s.jsx("div", { className: `w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${G.status === "completed" ? "bg-emerald-100 text-emerald-600" : G.status === "in-progress" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`, children: me(G.status) }),
                                        /* @__PURE__ */ s.jsxs("div", { className: "flex-1 min-w-0", children: [
                                          /* @__PURE__ */ s.jsx("h6", { className: "font-medium text-sm text-slate-800 mb-1 line-clamp-1", children: G.title }),
                                          /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600 line-clamp-2 leading-relaxed", children: G.details })
                                        ] }),
                                        /* @__PURE__ */ s.jsx(Lt, { size: 12, className: "text-slate-300 flex-shrink-0 mt-1" })
                                      ] })
                                    },
                                    G.id
                                  )) })
                                ]
                              },
                              w
                            )) })
                          ) : (
                            // All items view
                            /* @__PURE__ */ s.jsx("div", { className: "p-4", children: /* @__PURE__ */ s.jsx("div", { className: "grid gap-2", children: O.map((w, B) => /* @__PURE__ */ s.jsx(
                              D.button,
                              {
                                initial: { opacity: 0, y: 5 },
                                animate: { opacity: 1, y: 0 },
                                transition: { delay: B * 0.02 },
                                onClick: () => {
                                  const W = h.findIndex((G) => G.id === w.id);
                                  m(W), g(!1), j(!1);
                                },
                                className: "w-full text-left p-3 rounded-lg bg-white hover:bg-gradient-to-r hover:from-slate-50 hover:to-white border border-slate-200/50 hover:border-slate-300/50 hover:shadow-sm transition-all",
                                children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                                  /* @__PURE__ */ s.jsx("div", { className: `w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${w.status === "completed" ? "bg-emerald-100 text-emerald-600" : w.status === "in-progress" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`, children: me(w.status) }),
                                  /* @__PURE__ */ s.jsxs("div", { className: "flex-1 min-w-0", children: [
                                    /* @__PURE__ */ s.jsx("h6", { className: "font-medium text-sm text-slate-800 mb-2 line-clamp-1", children: w.title }),
                                    /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600 line-clamp-2 leading-relaxed mb-2", children: w.details }),
                                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                                      /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-1", children: [
                                        /* @__PURE__ */ s.jsx("div", { className: `w-2 h-2 rounded-full ${w.priority === "high" ? "bg-red-400" : w.priority === "medium" ? "bg-amber-400" : "bg-green-400"}` }),
                                        /* @__PURE__ */ s.jsx("span", { className: "text-xs text-slate-500 capitalize", children: w.priority })
                                      ] }),
                                      /* @__PURE__ */ s.jsx("span", { className: "text-slate-300", children: "•" }),
                                      /* @__PURE__ */ s.jsx("span", { className: "text-xs text-slate-500", children: w.category })
                                    ] })
                                  ] }),
                                  /* @__PURE__ */ s.jsx(Lt, { size: 14, className: "text-slate-300 flex-shrink-0 mt-1" })
                                ] })
                              },
                              w.id
                            )) }) })
                          )
                        }
                      )
                    ] })
                  ] })
                }
              )
            ]
          }
        ) })
      ]
    }
  );
}
function ge(e, t, { checkForDefaultPrevented: n = !0 } = {}) {
  return function(i) {
    if (e?.(i), n === !1 || !i.defaultPrevented)
      return t?.(i);
  };
}
function bg(e, t) {
  const n = p.createContext(t), r = (a) => {
    const { children: o, ...l } = a, c = p.useMemo(() => l, Object.values(l));
    return /* @__PURE__ */ s.jsx(n.Provider, { value: c, children: o });
  };
  r.displayName = e + "Provider";
  function i(a) {
    const o = p.useContext(n);
    if (o) return o;
    if (t !== void 0) return t;
    throw new Error(`\`${a}\` must be used within \`${e}\``);
  }
  return [r, i];
}
function bs(e, t = []) {
  let n = [];
  function r(a, o) {
    const l = p.createContext(o), c = n.length;
    n = [...n, o];
    const u = (m) => {
      const { scope: h, children: f, ...v } = m, g = h?.[e]?.[c] || l, N = p.useMemo(() => v, Object.values(v));
      return /* @__PURE__ */ s.jsx(g.Provider, { value: N, children: f });
    };
    u.displayName = a + "Provider";
    function d(m, h) {
      const f = h?.[e]?.[c] || l, v = p.useContext(f);
      if (v) return v;
      if (o !== void 0) return o;
      throw new Error(`\`${m}\` must be used within \`${a}\``);
    }
    return [u, d];
  }
  const i = () => {
    const a = n.map((o) => p.createContext(o));
    return function(l) {
      const c = l?.[e] || a;
      return p.useMemo(
        () => ({ [`__scope${e}`]: { ...l, [e]: c } }),
        [l, c]
      );
    };
  };
  return i.scopeName = e, [r, vg(i, ...t)];
}
function vg(...e) {
  const t = e[0];
  if (e.length === 1) return t;
  const n = () => {
    const r = e.map((i) => ({
      useScope: i(),
      scopeName: i.scopeName
    }));
    return function(a) {
      const o = r.reduce((l, { useScope: c, scopeName: u }) => {
        const m = c(a)[`__scope${u}`];
        return { ...l, ...m };
      }, {});
      return p.useMemo(() => ({ [`__scope${t.scopeName}`]: o }), [o]);
    };
  };
  return n.scopeName = t.scopeName, n;
}
var Ut = globalThis?.document ? p.useLayoutEffect : () => {
}, yg = p[" useId ".trim().toString()] || (() => {
}), jg = 0;
function Vs(e) {
  const [t, n] = p.useState(yg());
  return Ut(() => {
    n((r) => r ?? String(jg++));
  }, [e]), e || (t ? `radix-${t}` : "");
}
var wg = p[" useInsertionEffect ".trim().toString()] || Ut;
function Gn({
  prop: e,
  defaultProp: t,
  onChange: n = () => {
  },
  caller: r
}) {
  const [i, a, o] = Ng({
    defaultProp: t,
    onChange: n
  }), l = e !== void 0, c = l ? e : i;
  {
    const d = p.useRef(e !== void 0);
    p.useEffect(() => {
      const m = d.current;
      m !== l && console.warn(
        `${r} is changing from ${m ? "controlled" : "uncontrolled"} to ${l ? "controlled" : "uncontrolled"}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
      ), d.current = l;
    }, [l, r]);
  }
  const u = p.useCallback(
    (d) => {
      if (l) {
        const m = Cg(d) ? d(e) : d;
        m !== e && o.current?.(m);
      } else
        a(d);
    },
    [l, e, a, o]
  );
  return [c, u];
}
function Ng({
  defaultProp: e,
  onChange: t
}) {
  const [n, r] = p.useState(e), i = p.useRef(n), a = p.useRef(t);
  return wg(() => {
    a.current = t;
  }, [t]), p.useEffect(() => {
    i.current !== n && (a.current?.(n), i.current = n);
  }, [n, i]), [n, r, a];
}
function Cg(e) {
  return typeof e == "function";
}
function st(e) {
  const t = p.useRef(e);
  return p.useEffect(() => {
    t.current = e;
  }), p.useMemo(() => (...n) => t.current?.(...n), []);
}
function Sg(e, t = globalThis?.document) {
  const n = st(e);
  p.useEffect(() => {
    const r = (i) => {
      i.key === "Escape" && n(i);
    };
    return t.addEventListener("keydown", r, { capture: !0 }), () => t.removeEventListener("keydown", r, { capture: !0 });
  }, [n, t]);
}
var kg = "DismissableLayer", ri = "dismissableLayer.update", Tg = "dismissableLayer.pointerDownOutside", Pg = "dismissableLayer.focusOutside", Do, Yc = p.createContext({
  layers: /* @__PURE__ */ new Set(),
  layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
  branches: /* @__PURE__ */ new Set()
}), qc = p.forwardRef(
  (e, t) => {
    const {
      disableOutsidePointerEvents: n = !1,
      onEscapeKeyDown: r,
      onPointerDownOutside: i,
      onFocusOutside: a,
      onInteractOutside: o,
      onDismiss: l,
      ...c
    } = e, u = p.useContext(Yc), [d, m] = p.useState(null), h = d?.ownerDocument ?? globalThis?.document, [, f] = p.useState({}), v = Ve(t, (A) => m(A)), g = Array.from(u.layers), [N] = [...u.layersWithOutsidePointerEventsDisabled].slice(-1), j = g.indexOf(N), b = d ? g.indexOf(d) : -1, y = u.layersWithOutsidePointerEventsDisabled.size > 0, S = b >= j, T = Rg((A) => {
      const k = A.target, L = [...u.branches].some((O) => O.contains(k));
      !S || L || (i?.(A), o?.(A), A.defaultPrevented || l?.());
    }, h), E = Mg((A) => {
      const k = A.target;
      [...u.branches].some((O) => O.contains(k)) || (a?.(A), o?.(A), A.defaultPrevented || l?.());
    }, h);
    return Sg((A) => {
      b === u.layers.size - 1 && (r?.(A), !A.defaultPrevented && l && (A.preventDefault(), l()));
    }, h), p.useEffect(() => {
      if (d)
        return n && (u.layersWithOutsidePointerEventsDisabled.size === 0 && (Do = h.body.style.pointerEvents, h.body.style.pointerEvents = "none"), u.layersWithOutsidePointerEventsDisabled.add(d)), u.layers.add(d), Oo(), () => {
          n && u.layersWithOutsidePointerEventsDisabled.size === 1 && (h.body.style.pointerEvents = Do);
        };
    }, [d, h, n, u]), p.useEffect(() => () => {
      d && (u.layers.delete(d), u.layersWithOutsidePointerEventsDisabled.delete(d), Oo());
    }, [d, u]), p.useEffect(() => {
      const A = () => f({});
      return document.addEventListener(ri, A), () => document.removeEventListener(ri, A);
    }, []), /* @__PURE__ */ s.jsx(
      je.div,
      {
        ...c,
        ref: v,
        style: {
          pointerEvents: y ? S ? "auto" : "none" : void 0,
          ...e.style
        },
        onFocusCapture: ge(e.onFocusCapture, E.onFocusCapture),
        onBlurCapture: ge(e.onBlurCapture, E.onBlurCapture),
        onPointerDownCapture: ge(
          e.onPointerDownCapture,
          T.onPointerDownCapture
        )
      }
    );
  }
);
qc.displayName = kg;
var Eg = "DismissableLayerBranch", Ag = p.forwardRef((e, t) => {
  const n = p.useContext(Yc), r = p.useRef(null), i = Ve(t, r);
  return p.useEffect(() => {
    const a = r.current;
    if (a)
      return n.branches.add(a), () => {
        n.branches.delete(a);
      };
  }, [n.branches]), /* @__PURE__ */ s.jsx(je.div, { ...e, ref: i });
});
Ag.displayName = Eg;
function Rg(e, t = globalThis?.document) {
  const n = st(e), r = p.useRef(!1), i = p.useRef(() => {
  });
  return p.useEffect(() => {
    const a = (l) => {
      if (l.target && !r.current) {
        let c = function() {
          Xc(
            Tg,
            n,
            u,
            { discrete: !0 }
          );
        };
        const u = { originalEvent: l };
        l.pointerType === "touch" ? (t.removeEventListener("click", i.current), i.current = c, t.addEventListener("click", i.current, { once: !0 })) : c();
      } else
        t.removeEventListener("click", i.current);
      r.current = !1;
    }, o = window.setTimeout(() => {
      t.addEventListener("pointerdown", a);
    }, 0);
    return () => {
      window.clearTimeout(o), t.removeEventListener("pointerdown", a), t.removeEventListener("click", i.current);
    };
  }, [t, n]), {
    // ensures we check React component tree (not just DOM tree)
    onPointerDownCapture: () => r.current = !0
  };
}
function Mg(e, t = globalThis?.document) {
  const n = st(e), r = p.useRef(!1);
  return p.useEffect(() => {
    const i = (a) => {
      a.target && !r.current && Xc(Pg, n, { originalEvent: a }, {
        discrete: !1
      });
    };
    return t.addEventListener("focusin", i), () => t.removeEventListener("focusin", i);
  }, [t, n]), {
    onFocusCapture: () => r.current = !0,
    onBlurCapture: () => r.current = !1
  };
}
function Oo() {
  const e = new CustomEvent(ri);
  document.dispatchEvent(e);
}
function Xc(e, t, n, { discrete: r }) {
  const i = n.originalEvent.target, a = new CustomEvent(e, { bubbles: !1, cancelable: !0, detail: n });
  t && i.addEventListener(e, t, { once: !0 }), r ? og(i, a) : i.dispatchEvent(a);
}
var wr = "focusScope.autoFocusOnMount", Nr = "focusScope.autoFocusOnUnmount", Vo = { bubbles: !1, cancelable: !0 }, Ig = "FocusScope", Zc = p.forwardRef((e, t) => {
  const {
    loop: n = !1,
    trapped: r = !1,
    onMountAutoFocus: i,
    onUnmountAutoFocus: a,
    ...o
  } = e, [l, c] = p.useState(null), u = st(i), d = st(a), m = p.useRef(null), h = Ve(t, (g) => c(g)), f = p.useRef({
    paused: !1,
    pause() {
      this.paused = !0;
    },
    resume() {
      this.paused = !1;
    }
  }).current;
  p.useEffect(() => {
    if (r) {
      let g = function(y) {
        if (f.paused || !l) return;
        const S = y.target;
        l.contains(S) ? m.current = S : Et(m.current, { select: !0 });
      }, N = function(y) {
        if (f.paused || !l) return;
        const S = y.relatedTarget;
        S !== null && (l.contains(S) || Et(m.current, { select: !0 }));
      }, j = function(y) {
        if (document.activeElement === document.body)
          for (const T of y)
            T.removedNodes.length > 0 && Et(l);
      };
      document.addEventListener("focusin", g), document.addEventListener("focusout", N);
      const b = new MutationObserver(j);
      return l && b.observe(l, { childList: !0, subtree: !0 }), () => {
        document.removeEventListener("focusin", g), document.removeEventListener("focusout", N), b.disconnect();
      };
    }
  }, [r, l, f.paused]), p.useEffect(() => {
    if (l) {
      Fo.add(f);
      const g = document.activeElement;
      if (!l.contains(g)) {
        const j = new CustomEvent(wr, Vo);
        l.addEventListener(wr, u), l.dispatchEvent(j), j.defaultPrevented || (Dg(zg(Qc(l)), { select: !0 }), document.activeElement === g && Et(l));
      }
      return () => {
        l.removeEventListener(wr, u), setTimeout(() => {
          const j = new CustomEvent(Nr, Vo);
          l.addEventListener(Nr, d), l.dispatchEvent(j), j.defaultPrevented || Et(g ?? document.body, { select: !0 }), l.removeEventListener(Nr, d), Fo.remove(f);
        }, 0);
      };
    }
  }, [l, u, d, f]);
  const v = p.useCallback(
    (g) => {
      if (!n && !r || f.paused) return;
      const N = g.key === "Tab" && !g.altKey && !g.ctrlKey && !g.metaKey, j = document.activeElement;
      if (N && j) {
        const b = g.currentTarget, [y, S] = Og(b);
        y && S ? !g.shiftKey && j === S ? (g.preventDefault(), n && Et(y, { select: !0 })) : g.shiftKey && j === y && (g.preventDefault(), n && Et(S, { select: !0 })) : j === b && g.preventDefault();
      }
    },
    [n, r, f.paused]
  );
  return /* @__PURE__ */ s.jsx(je.div, { tabIndex: -1, ...o, ref: h, onKeyDown: v });
});
Zc.displayName = Ig;
function Dg(e, { select: t = !1 } = {}) {
  const n = document.activeElement;
  for (const r of e)
    if (Et(r, { select: t }), document.activeElement !== n) return;
}
function Og(e) {
  const t = Qc(e), n = Lo(t, e), r = Lo(t.reverse(), e);
  return [n, r];
}
function Qc(e) {
  const t = [], n = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (r) => {
      const i = r.tagName === "INPUT" && r.type === "hidden";
      return r.disabled || r.hidden || i ? NodeFilter.FILTER_SKIP : r.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  for (; n.nextNode(); ) t.push(n.currentNode);
  return t;
}
function Lo(e, t) {
  for (const n of e)
    if (!Vg(n, { upTo: t })) return n;
}
function Vg(e, { upTo: t }) {
  if (getComputedStyle(e).visibility === "hidden") return !0;
  for (; e; ) {
    if (t !== void 0 && e === t) return !1;
    if (getComputedStyle(e).display === "none") return !0;
    e = e.parentElement;
  }
  return !1;
}
function Lg(e) {
  return e instanceof HTMLInputElement && "select" in e;
}
function Et(e, { select: t = !1 } = {}) {
  if (e && e.focus) {
    const n = document.activeElement;
    e.focus({ preventScroll: !0 }), e !== n && Lg(e) && t && e.select();
  }
}
var Fo = Fg();
function Fg() {
  let e = [];
  return {
    add(t) {
      const n = e[0];
      t !== n && n?.pause(), e = zo(e, t), e.unshift(t);
    },
    remove(t) {
      e = zo(e, t), e[0]?.resume();
    }
  };
}
function zo(e, t) {
  const n = [...e], r = n.indexOf(t);
  return r !== -1 && n.splice(r, 1), n;
}
function zg(e) {
  return e.filter((t) => t.tagName !== "A");
}
var _g = "Portal", Jc = p.forwardRef((e, t) => {
  const { container: n, ...r } = e, [i, a] = p.useState(!1);
  Ut(() => a(!0), []);
  const o = n || i && globalThis?.document?.body;
  return o ? Eu.createPortal(/* @__PURE__ */ s.jsx(je.div, { ...r, ref: t }), o) : null;
});
Jc.displayName = _g;
function $g(e, t) {
  return p.useReducer((n, r) => t[n][r] ?? n, e);
}
var gt = (e) => {
  const { present: t, children: n } = e, r = Bg(t), i = typeof n == "function" ? n({ present: r.isPresent }) : p.Children.only(n), a = Ve(r.ref, Wg(i));
  return typeof n == "function" || r.isPresent ? p.cloneElement(i, { ref: a }) : null;
};
gt.displayName = "Presence";
function Bg(e) {
  const [t, n] = p.useState(), r = p.useRef(null), i = p.useRef(e), a = p.useRef("none"), o = e ? "mounted" : "unmounted", [l, c] = $g(o, {
    mounted: {
      UNMOUNT: "unmounted",
      ANIMATION_OUT: "unmountSuspended"
    },
    unmountSuspended: {
      MOUNT: "mounted",
      ANIMATION_END: "unmounted"
    },
    unmounted: {
      MOUNT: "mounted"
    }
  });
  return p.useEffect(() => {
    const u = pn(r.current);
    a.current = l === "mounted" ? u : "none";
  }, [l]), Ut(() => {
    const u = r.current, d = i.current;
    if (d !== e) {
      const h = a.current, f = pn(u);
      e ? c("MOUNT") : f === "none" || u?.display === "none" ? c("UNMOUNT") : c(d && h !== f ? "ANIMATION_OUT" : "UNMOUNT"), i.current = e;
    }
  }, [e, c]), Ut(() => {
    if (t) {
      let u;
      const d = t.ownerDocument.defaultView ?? window, m = (f) => {
        const g = pn(r.current).includes(CSS.escape(f.animationName));
        if (f.target === t && g && (c("ANIMATION_END"), !i.current)) {
          const N = t.style.animationFillMode;
          t.style.animationFillMode = "forwards", u = d.setTimeout(() => {
            t.style.animationFillMode === "forwards" && (t.style.animationFillMode = N);
          });
        }
      }, h = (f) => {
        f.target === t && (a.current = pn(r.current));
      };
      return t.addEventListener("animationstart", h), t.addEventListener("animationcancel", m), t.addEventListener("animationend", m), () => {
        d.clearTimeout(u), t.removeEventListener("animationstart", h), t.removeEventListener("animationcancel", m), t.removeEventListener("animationend", m);
      };
    } else
      c("ANIMATION_END");
  }, [t, c]), {
    isPresent: ["mounted", "unmountSuspended"].includes(l),
    ref: p.useCallback((u) => {
      r.current = u ? getComputedStyle(u) : null, n(u);
    }, [])
  };
}
function pn(e) {
  return e?.animationName || "none";
}
function Wg(e) {
  let t = Object.getOwnPropertyDescriptor(e.props, "ref")?.get, n = t && "isReactWarning" in t && t.isReactWarning;
  return n ? e.ref : (t = Object.getOwnPropertyDescriptor(e, "ref")?.get, n = t && "isReactWarning" in t && t.isReactWarning, n ? e.props.ref : e.props.ref || e.ref);
}
var Cr = 0;
function Ug() {
  p.useEffect(() => {
    const e = document.querySelectorAll("[data-radix-focus-guard]");
    return document.body.insertAdjacentElement("afterbegin", e[0] ?? _o()), document.body.insertAdjacentElement("beforeend", e[1] ?? _o()), Cr++, () => {
      Cr === 1 && document.querySelectorAll("[data-radix-focus-guard]").forEach((t) => t.remove()), Cr--;
    };
  }, []);
}
function _o() {
  const e = document.createElement("span");
  return e.setAttribute("data-radix-focus-guard", ""), e.tabIndex = 0, e.style.outline = "none", e.style.opacity = "0", e.style.position = "fixed", e.style.pointerEvents = "none", e;
}
var ft = function() {
  return ft = Object.assign || function(t) {
    for (var n, r = 1, i = arguments.length; r < i; r++) {
      n = arguments[r];
      for (var a in n) Object.prototype.hasOwnProperty.call(n, a) && (t[a] = n[a]);
    }
    return t;
  }, ft.apply(this, arguments);
};
function ed(e, t) {
  var n = {};
  for (var r in e) Object.prototype.hasOwnProperty.call(e, r) && t.indexOf(r) < 0 && (n[r] = e[r]);
  if (e != null && typeof Object.getOwnPropertySymbols == "function")
    for (var i = 0, r = Object.getOwnPropertySymbols(e); i < r.length; i++)
      t.indexOf(r[i]) < 0 && Object.prototype.propertyIsEnumerable.call(e, r[i]) && (n[r[i]] = e[r[i]]);
  return n;
}
function Hg(e, t, n) {
  if (n || arguments.length === 2) for (var r = 0, i = t.length, a; r < i; r++)
    (a || !(r in t)) && (a || (a = Array.prototype.slice.call(t, 0, r)), a[r] = t[r]);
  return e.concat(a || Array.prototype.slice.call(t));
}
var En = "right-scroll-bar-position", An = "width-before-scroll-bar", Gg = "with-scroll-bars-hidden", Kg = "--removed-body-scroll-bar-size";
function Sr(e, t) {
  return typeof e == "function" ? e(t) : e && (e.current = t), e;
}
function Yg(e, t) {
  var n = ve(function() {
    return {
      // value
      value: e,
      // last callback
      callback: t,
      // "memoized" public interface
      facade: {
        get current() {
          return n.value;
        },
        set current(r) {
          var i = n.value;
          i !== r && (n.value = r, n.callback(r, i));
        }
      }
    };
  })[0];
  return n.callback = t, n.facade;
}
var qg = typeof window < "u" ? p.useLayoutEffect : p.useEffect, $o = /* @__PURE__ */ new WeakMap();
function Xg(e, t) {
  var n = Yg(null, function(r) {
    return e.forEach(function(i) {
      return Sr(i, r);
    });
  });
  return qg(function() {
    var r = $o.get(n);
    if (r) {
      var i = new Set(r), a = new Set(e), o = n.current;
      i.forEach(function(l) {
        a.has(l) || Sr(l, null);
      }), a.forEach(function(l) {
        i.has(l) || Sr(l, o);
      });
    }
    $o.set(n, e);
  }, [e]), n;
}
function Zg(e) {
  return e;
}
function Qg(e, t) {
  t === void 0 && (t = Zg);
  var n = [], r = !1, i = {
    read: function() {
      if (r)
        throw new Error("Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.");
      return n.length ? n[n.length - 1] : e;
    },
    useMedium: function(a) {
      var o = t(a, r);
      return n.push(o), function() {
        n = n.filter(function(l) {
          return l !== o;
        });
      };
    },
    assignSyncMedium: function(a) {
      for (r = !0; n.length; ) {
        var o = n;
        n = [], o.forEach(a);
      }
      n = {
        push: function(l) {
          return a(l);
        },
        filter: function() {
          return n;
        }
      };
    },
    assignMedium: function(a) {
      r = !0;
      var o = [];
      if (n.length) {
        var l = n;
        n = [], l.forEach(a), o = n;
      }
      var c = function() {
        var d = o;
        o = [], d.forEach(a);
      }, u = function() {
        return Promise.resolve().then(c);
      };
      u(), n = {
        push: function(d) {
          o.push(d), u();
        },
        filter: function(d) {
          return o = o.filter(d), n;
        }
      };
    }
  };
  return i;
}
function Jg(e) {
  e === void 0 && (e = {});
  var t = Qg(null);
  return t.options = ft({ async: !0, ssr: !1 }, e), t;
}
var td = function(e) {
  var t = e.sideCar, n = ed(e, ["sideCar"]);
  if (!t)
    throw new Error("Sidecar: please provide `sideCar` property to import the right car");
  var r = t.read();
  if (!r)
    throw new Error("Sidecar medium not found");
  return p.createElement(r, ft({}, n));
};
td.isSideCarExport = !0;
function eb(e, t) {
  return e.useMedium(t), td;
}
var sd = Jg(), kr = function() {
}, Kn = p.forwardRef(function(e, t) {
  var n = p.useRef(null), r = p.useState({
    onScrollCapture: kr,
    onWheelCapture: kr,
    onTouchMoveCapture: kr
  }), i = r[0], a = r[1], o = e.forwardProps, l = e.children, c = e.className, u = e.removeScrollBar, d = e.enabled, m = e.shards, h = e.sideCar, f = e.noRelative, v = e.noIsolation, g = e.inert, N = e.allowPinchZoom, j = e.as, b = j === void 0 ? "div" : j, y = e.gapMode, S = ed(e, ["forwardProps", "children", "className", "removeScrollBar", "enabled", "shards", "sideCar", "noRelative", "noIsolation", "inert", "allowPinchZoom", "as", "gapMode"]), T = h, E = Xg([n, t]), A = ft(ft({}, S), i);
  return p.createElement(
    p.Fragment,
    null,
    d && p.createElement(T, { sideCar: sd, removeScrollBar: u, shards: m, noRelative: f, noIsolation: v, inert: g, setCallbacks: a, allowPinchZoom: !!N, lockRef: n, gapMode: y }),
    o ? p.cloneElement(p.Children.only(l), ft(ft({}, A), { ref: E })) : p.createElement(b, ft({}, A, { className: c, ref: E }), l)
  );
});
Kn.defaultProps = {
  enabled: !0,
  removeScrollBar: !0,
  inert: !1
};
Kn.classNames = {
  fullWidth: An,
  zeroRight: En
};
var tb = function() {
  if (typeof __webpack_nonce__ < "u")
    return __webpack_nonce__;
};
function sb() {
  if (!document)
    return null;
  var e = document.createElement("style");
  e.type = "text/css";
  var t = tb();
  return t && e.setAttribute("nonce", t), e;
}
function nb(e, t) {
  e.styleSheet ? e.styleSheet.cssText = t : e.appendChild(document.createTextNode(t));
}
function rb(e) {
  var t = document.head || document.getElementsByTagName("head")[0];
  t.appendChild(e);
}
var ib = function() {
  var e = 0, t = null;
  return {
    add: function(n) {
      e == 0 && (t = sb()) && (nb(t, n), rb(t)), e++;
    },
    remove: function() {
      e--, !e && t && (t.parentNode && t.parentNode.removeChild(t), t = null);
    }
  };
}, ab = function() {
  var e = ib();
  return function(t, n) {
    p.useEffect(function() {
      return e.add(t), function() {
        e.remove();
      };
    }, [t && n]);
  };
}, nd = function() {
  var e = ab(), t = function(n) {
    var r = n.styles, i = n.dynamic;
    return e(r, i), null;
  };
  return t;
}, ob = {
  left: 0,
  top: 0,
  right: 0,
  gap: 0
}, Tr = function(e) {
  return parseInt(e || "", 10) || 0;
}, lb = function(e) {
  var t = window.getComputedStyle(document.body), n = t[e === "padding" ? "paddingLeft" : "marginLeft"], r = t[e === "padding" ? "paddingTop" : "marginTop"], i = t[e === "padding" ? "paddingRight" : "marginRight"];
  return [Tr(n), Tr(r), Tr(i)];
}, cb = function(e) {
  if (e === void 0 && (e = "margin"), typeof window > "u")
    return ob;
  var t = lb(e), n = document.documentElement.clientWidth, r = window.innerWidth;
  return {
    left: t[0],
    top: t[1],
    right: t[2],
    gap: Math.max(0, r - n + t[2] - t[0])
  };
}, db = nd(), os = "data-scroll-locked", ub = function(e, t, n, r) {
  var i = e.left, a = e.top, o = e.right, l = e.gap;
  return n === void 0 && (n = "margin"), `
  .`.concat(Gg, ` {
   overflow: hidden `).concat(r, `;
   padding-right: `).concat(l, "px ").concat(r, `;
  }
  body[`).concat(os, `] {
    overflow: hidden `).concat(r, `;
    overscroll-behavior: contain;
    `).concat([
    t && "position: relative ".concat(r, ";"),
    n === "margin" && `
    padding-left: `.concat(i, `px;
    padding-top: `).concat(a, `px;
    padding-right: `).concat(o, `px;
    margin-left:0;
    margin-top:0;
    margin-right: `).concat(l, "px ").concat(r, `;
    `),
    n === "padding" && "padding-right: ".concat(l, "px ").concat(r, ";")
  ].filter(Boolean).join(""), `
  }
  
  .`).concat(En, ` {
    right: `).concat(l, "px ").concat(r, `;
  }
  
  .`).concat(An, ` {
    margin-right: `).concat(l, "px ").concat(r, `;
  }
  
  .`).concat(En, " .").concat(En, ` {
    right: 0 `).concat(r, `;
  }
  
  .`).concat(An, " .").concat(An, ` {
    margin-right: 0 `).concat(r, `;
  }
  
  body[`).concat(os, `] {
    `).concat(Kg, ": ").concat(l, `px;
  }
`);
}, Bo = function() {
  var e = parseInt(document.body.getAttribute(os) || "0", 10);
  return isFinite(e) ? e : 0;
}, mb = function() {
  p.useEffect(function() {
    return document.body.setAttribute(os, (Bo() + 1).toString()), function() {
      var e = Bo() - 1;
      e <= 0 ? document.body.removeAttribute(os) : document.body.setAttribute(os, e.toString());
    };
  }, []);
}, hb = function(e) {
  var t = e.noRelative, n = e.noImportant, r = e.gapMode, i = r === void 0 ? "margin" : r;
  mb();
  var a = p.useMemo(function() {
    return cb(i);
  }, [i]);
  return p.createElement(db, { styles: ub(a, !t, i, n ? "" : "!important") });
}, ii = !1;
if (typeof window < "u")
  try {
    var xn = Object.defineProperty({}, "passive", {
      get: function() {
        return ii = !0, !0;
      }
    });
    window.addEventListener("test", xn, xn), window.removeEventListener("test", xn, xn);
  } catch {
    ii = !1;
  }
var Xt = ii ? { passive: !1 } : !1, fb = function(e) {
  return e.tagName === "TEXTAREA";
}, rd = function(e, t) {
  if (!(e instanceof Element))
    return !1;
  var n = window.getComputedStyle(e);
  return (
    // not-not-scrollable
    n[t] !== "hidden" && // contains scroll inside self
    !(n.overflowY === n.overflowX && !fb(e) && n[t] === "visible")
  );
}, pb = function(e) {
  return rd(e, "overflowY");
}, xb = function(e) {
  return rd(e, "overflowX");
}, Wo = function(e, t) {
  var n = t.ownerDocument, r = t;
  do {
    typeof ShadowRoot < "u" && r instanceof ShadowRoot && (r = r.host);
    var i = id(e, r);
    if (i) {
      var a = ad(e, r), o = a[1], l = a[2];
      if (o > l)
        return !0;
    }
    r = r.parentNode;
  } while (r && r !== n.body);
  return !1;
}, gb = function(e) {
  var t = e.scrollTop, n = e.scrollHeight, r = e.clientHeight;
  return [
    t,
    n,
    r
  ];
}, bb = function(e) {
  var t = e.scrollLeft, n = e.scrollWidth, r = e.clientWidth;
  return [
    t,
    n,
    r
  ];
}, id = function(e, t) {
  return e === "v" ? pb(t) : xb(t);
}, ad = function(e, t) {
  return e === "v" ? gb(t) : bb(t);
}, vb = function(e, t) {
  return e === "h" && t === "rtl" ? -1 : 1;
}, yb = function(e, t, n, r, i) {
  var a = vb(e, window.getComputedStyle(t).direction), o = a * r, l = n.target, c = t.contains(l), u = !1, d = o > 0, m = 0, h = 0;
  do {
    if (!l)
      break;
    var f = ad(e, l), v = f[0], g = f[1], N = f[2], j = g - N - a * v;
    (v || j) && id(e, l) && (m += j, h += v);
    var b = l.parentNode;
    l = b && b.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? b.host : b;
  } while (
    // portaled content
    !c && l !== document.body || // self content
    c && (t.contains(l) || t === l)
  );
  return (d && Math.abs(m) < 1 || !d && Math.abs(h) < 1) && (u = !0), u;
}, gn = function(e) {
  return "changedTouches" in e ? [e.changedTouches[0].clientX, e.changedTouches[0].clientY] : [0, 0];
}, Uo = function(e) {
  return [e.deltaX, e.deltaY];
}, Ho = function(e) {
  return e && "current" in e ? e.current : e;
}, jb = function(e, t) {
  return e[0] === t[0] && e[1] === t[1];
}, wb = function(e) {
  return `
  .block-interactivity-`.concat(e, ` {pointer-events: none;}
  .allow-interactivity-`).concat(e, ` {pointer-events: all;}
`);
}, Nb = 0, Zt = [];
function Cb(e) {
  var t = p.useRef([]), n = p.useRef([0, 0]), r = p.useRef(), i = p.useState(Nb++)[0], a = p.useState(nd)[0], o = p.useRef(e);
  p.useEffect(function() {
    o.current = e;
  }, [e]), p.useEffect(function() {
    if (e.inert) {
      document.body.classList.add("block-interactivity-".concat(i));
      var g = Hg([e.lockRef.current], (e.shards || []).map(Ho), !0).filter(Boolean);
      return g.forEach(function(N) {
        return N.classList.add("allow-interactivity-".concat(i));
      }), function() {
        document.body.classList.remove("block-interactivity-".concat(i)), g.forEach(function(N) {
          return N.classList.remove("allow-interactivity-".concat(i));
        });
      };
    }
  }, [e.inert, e.lockRef.current, e.shards]);
  var l = p.useCallback(function(g, N) {
    if ("touches" in g && g.touches.length === 2 || g.type === "wheel" && g.ctrlKey)
      return !o.current.allowPinchZoom;
    var j = gn(g), b = n.current, y = "deltaX" in g ? g.deltaX : b[0] - j[0], S = "deltaY" in g ? g.deltaY : b[1] - j[1], T, E = g.target, A = Math.abs(y) > Math.abs(S) ? "h" : "v";
    if ("touches" in g && A === "h" && E.type === "range")
      return !1;
    var k = Wo(A, E);
    if (!k)
      return !0;
    if (k ? T = A : (T = A === "v" ? "h" : "v", k = Wo(A, E)), !k)
      return !1;
    if (!r.current && "changedTouches" in g && (y || S) && (r.current = T), !T)
      return !0;
    var L = r.current || T;
    return yb(L, N, g, L === "h" ? y : S);
  }, []), c = p.useCallback(function(g) {
    var N = g;
    if (!(!Zt.length || Zt[Zt.length - 1] !== a)) {
      var j = "deltaY" in N ? Uo(N) : gn(N), b = t.current.filter(function(T) {
        return T.name === N.type && (T.target === N.target || N.target === T.shadowParent) && jb(T.delta, j);
      })[0];
      if (b && b.should) {
        N.cancelable && N.preventDefault();
        return;
      }
      if (!b) {
        var y = (o.current.shards || []).map(Ho).filter(Boolean).filter(function(T) {
          return T.contains(N.target);
        }), S = y.length > 0 ? l(N, y[0]) : !o.current.noIsolation;
        S && N.cancelable && N.preventDefault();
      }
    }
  }, []), u = p.useCallback(function(g, N, j, b) {
    var y = { name: g, delta: N, target: j, should: b, shadowParent: Sb(j) };
    t.current.push(y), setTimeout(function() {
      t.current = t.current.filter(function(S) {
        return S !== y;
      });
    }, 1);
  }, []), d = p.useCallback(function(g) {
    n.current = gn(g), r.current = void 0;
  }, []), m = p.useCallback(function(g) {
    u(g.type, Uo(g), g.target, l(g, e.lockRef.current));
  }, []), h = p.useCallback(function(g) {
    u(g.type, gn(g), g.target, l(g, e.lockRef.current));
  }, []);
  p.useEffect(function() {
    return Zt.push(a), e.setCallbacks({
      onScrollCapture: m,
      onWheelCapture: m,
      onTouchMoveCapture: h
    }), document.addEventListener("wheel", c, Xt), document.addEventListener("touchmove", c, Xt), document.addEventListener("touchstart", d, Xt), function() {
      Zt = Zt.filter(function(g) {
        return g !== a;
      }), document.removeEventListener("wheel", c, Xt), document.removeEventListener("touchmove", c, Xt), document.removeEventListener("touchstart", d, Xt);
    };
  }, []);
  var f = e.removeScrollBar, v = e.inert;
  return p.createElement(
    p.Fragment,
    null,
    v ? p.createElement(a, { styles: wb(i) }) : null,
    f ? p.createElement(hb, { noRelative: e.noRelative, gapMode: e.gapMode }) : null
  );
}
function Sb(e) {
  for (var t = null; e !== null; )
    e instanceof ShadowRoot && (t = e.host, e = e.host), e = e.parentNode;
  return t;
}
const kb = eb(sd, Cb);
var od = p.forwardRef(function(e, t) {
  return p.createElement(Kn, ft({}, e, { ref: t, sideCar: kb }));
});
od.classNames = Kn.classNames;
var Tb = function(e) {
  if (typeof document > "u")
    return null;
  var t = Array.isArray(e) ? e[0] : e;
  return t.ownerDocument.body;
}, Qt = /* @__PURE__ */ new WeakMap(), bn = /* @__PURE__ */ new WeakMap(), vn = {}, Pr = 0, ld = function(e) {
  return e && (e.host || ld(e.parentNode));
}, Pb = function(e, t) {
  return t.map(function(n) {
    if (e.contains(n))
      return n;
    var r = ld(n);
    return r && e.contains(r) ? r : (console.error("aria-hidden", n, "in not contained inside", e, ". Doing nothing"), null);
  }).filter(function(n) {
    return !!n;
  });
}, Eb = function(e, t, n, r) {
  var i = Pb(t, Array.isArray(e) ? e : [e]);
  vn[n] || (vn[n] = /* @__PURE__ */ new WeakMap());
  var a = vn[n], o = [], l = /* @__PURE__ */ new Set(), c = new Set(i), u = function(m) {
    !m || l.has(m) || (l.add(m), u(m.parentNode));
  };
  i.forEach(u);
  var d = function(m) {
    !m || c.has(m) || Array.prototype.forEach.call(m.children, function(h) {
      if (l.has(h))
        d(h);
      else
        try {
          var f = h.getAttribute(r), v = f !== null && f !== "false", g = (Qt.get(h) || 0) + 1, N = (a.get(h) || 0) + 1;
          Qt.set(h, g), a.set(h, N), o.push(h), g === 1 && v && bn.set(h, !0), N === 1 && h.setAttribute(n, "true"), v || h.setAttribute(r, "true");
        } catch (j) {
          console.error("aria-hidden: cannot operate on ", h, j);
        }
    });
  };
  return d(t), l.clear(), Pr++, function() {
    o.forEach(function(m) {
      var h = Qt.get(m) - 1, f = a.get(m) - 1;
      Qt.set(m, h), a.set(m, f), h || (bn.has(m) || m.removeAttribute(r), bn.delete(m)), f || m.removeAttribute(n);
    }), Pr--, Pr || (Qt = /* @__PURE__ */ new WeakMap(), Qt = /* @__PURE__ */ new WeakMap(), bn = /* @__PURE__ */ new WeakMap(), vn = {});
  };
}, Ab = function(e, t, n) {
  n === void 0 && (n = "data-aria-hidden");
  var r = Array.from(Array.isArray(e) ? e : [e]), i = Tb(e);
  return i ? (r.push.apply(r, Array.from(i.querySelectorAll("[aria-live], script"))), Eb(r, i, n, "aria-hidden")) : function() {
    return null;
  };
}, Yn = "Dialog", [cd] = bs(Yn), [Rb, ht] = cd(Yn), dd = (e) => {
  const {
    __scopeDialog: t,
    children: n,
    open: r,
    defaultOpen: i,
    onOpenChange: a,
    modal: o = !0
  } = e, l = p.useRef(null), c = p.useRef(null), [u, d] = Gn({
    prop: r,
    defaultProp: i ?? !1,
    onChange: a,
    caller: Yn
  });
  return /* @__PURE__ */ s.jsx(
    Rb,
    {
      scope: t,
      triggerRef: l,
      contentRef: c,
      contentId: Vs(),
      titleId: Vs(),
      descriptionId: Vs(),
      open: u,
      onOpenChange: d,
      onOpenToggle: p.useCallback(() => d((m) => !m), [d]),
      modal: o,
      children: n
    }
  );
};
dd.displayName = Yn;
var ud = "DialogTrigger", Mb = p.forwardRef(
  (e, t) => {
    const { __scopeDialog: n, ...r } = e, i = ht(ud, n), a = Ve(t, i.triggerRef);
    return /* @__PURE__ */ s.jsx(
      je.button,
      {
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": i.open,
        "aria-controls": i.contentId,
        "data-state": Yi(i.open),
        ...r,
        ref: a,
        onClick: ge(e.onClick, i.onOpenToggle)
      }
    );
  }
);
Mb.displayName = ud;
var Gi = "DialogPortal", [Ib, md] = cd(Gi, {
  forceMount: void 0
}), hd = (e) => {
  const { __scopeDialog: t, forceMount: n, children: r, container: i } = e, a = ht(Gi, t);
  return /* @__PURE__ */ s.jsx(Ib, { scope: t, forceMount: n, children: p.Children.map(r, (o) => /* @__PURE__ */ s.jsx(gt, { present: n || a.open, children: /* @__PURE__ */ s.jsx(Jc, { asChild: !0, container: i, children: o }) })) });
};
hd.displayName = Gi;
var zn = "DialogOverlay", fd = p.forwardRef(
  (e, t) => {
    const n = md(zn, e.__scopeDialog), { forceMount: r = n.forceMount, ...i } = e, a = ht(zn, e.__scopeDialog);
    return a.modal ? /* @__PURE__ */ s.jsx(gt, { present: r || a.open, children: /* @__PURE__ */ s.jsx(Ob, { ...i, ref: t }) }) : null;
  }
);
fd.displayName = zn;
var Db = /* @__PURE__ */ Ws("DialogOverlay.RemoveScroll"), Ob = p.forwardRef(
  (e, t) => {
    const { __scopeDialog: n, ...r } = e, i = ht(zn, n);
    return (
      // Make sure `Content` is scrollable even when it doesn't live inside `RemoveScroll`
      // ie. when `Overlay` and `Content` are siblings
      /* @__PURE__ */ s.jsx(od, { as: Db, allowPinchZoom: !0, shards: [i.contentRef], children: /* @__PURE__ */ s.jsx(
        je.div,
        {
          "data-state": Yi(i.open),
          ...r,
          ref: t,
          style: { pointerEvents: "auto", ...r.style }
        }
      ) })
    );
  }
), Ht = "DialogContent", pd = p.forwardRef(
  (e, t) => {
    const n = md(Ht, e.__scopeDialog), { forceMount: r = n.forceMount, ...i } = e, a = ht(Ht, e.__scopeDialog);
    return /* @__PURE__ */ s.jsx(gt, { present: r || a.open, children: a.modal ? /* @__PURE__ */ s.jsx(Vb, { ...i, ref: t }) : /* @__PURE__ */ s.jsx(Lb, { ...i, ref: t }) });
  }
);
pd.displayName = Ht;
var Vb = p.forwardRef(
  (e, t) => {
    const n = ht(Ht, e.__scopeDialog), r = p.useRef(null), i = Ve(t, n.contentRef, r);
    return p.useEffect(() => {
      const a = r.current;
      if (a) return Ab(a);
    }, []), /* @__PURE__ */ s.jsx(
      xd,
      {
        ...e,
        ref: i,
        trapFocus: n.open,
        disableOutsidePointerEvents: !0,
        onCloseAutoFocus: ge(e.onCloseAutoFocus, (a) => {
          a.preventDefault(), n.triggerRef.current?.focus();
        }),
        onPointerDownOutside: ge(e.onPointerDownOutside, (a) => {
          const o = a.detail.originalEvent, l = o.button === 0 && o.ctrlKey === !0;
          (o.button === 2 || l) && a.preventDefault();
        }),
        onFocusOutside: ge(
          e.onFocusOutside,
          (a) => a.preventDefault()
        )
      }
    );
  }
), Lb = p.forwardRef(
  (e, t) => {
    const n = ht(Ht, e.__scopeDialog), r = p.useRef(!1), i = p.useRef(!1);
    return /* @__PURE__ */ s.jsx(
      xd,
      {
        ...e,
        ref: t,
        trapFocus: !1,
        disableOutsidePointerEvents: !1,
        onCloseAutoFocus: (a) => {
          e.onCloseAutoFocus?.(a), a.defaultPrevented || (r.current || n.triggerRef.current?.focus(), a.preventDefault()), r.current = !1, i.current = !1;
        },
        onInteractOutside: (a) => {
          e.onInteractOutside?.(a), a.defaultPrevented || (r.current = !0, a.detail.originalEvent.type === "pointerdown" && (i.current = !0));
          const o = a.target;
          n.triggerRef.current?.contains(o) && a.preventDefault(), a.detail.originalEvent.type === "focusin" && i.current && a.preventDefault();
        }
      }
    );
  }
), xd = p.forwardRef(
  (e, t) => {
    const { __scopeDialog: n, trapFocus: r, onOpenAutoFocus: i, onCloseAutoFocus: a, ...o } = e, l = ht(Ht, n), c = p.useRef(null), u = Ve(t, c);
    return Ug(), /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
      /* @__PURE__ */ s.jsx(
        Zc,
        {
          asChild: !0,
          loop: !0,
          trapped: r,
          onMountAutoFocus: i,
          onUnmountAutoFocus: a,
          children: /* @__PURE__ */ s.jsx(
            qc,
            {
              role: "dialog",
              id: l.contentId,
              "aria-describedby": l.descriptionId,
              "aria-labelledby": l.titleId,
              "data-state": Yi(l.open),
              ...o,
              ref: u,
              onDismiss: () => l.onOpenChange(!1)
            }
          )
        }
      ),
      /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
        /* @__PURE__ */ s.jsx(Fb, { titleId: l.titleId }),
        /* @__PURE__ */ s.jsx(_b, { contentRef: c, descriptionId: l.descriptionId })
      ] })
    ] });
  }
), Ki = "DialogTitle", gd = p.forwardRef(
  (e, t) => {
    const { __scopeDialog: n, ...r } = e, i = ht(Ki, n);
    return /* @__PURE__ */ s.jsx(je.h2, { id: i.titleId, ...r, ref: t });
  }
);
gd.displayName = Ki;
var bd = "DialogDescription", vd = p.forwardRef(
  (e, t) => {
    const { __scopeDialog: n, ...r } = e, i = ht(bd, n);
    return /* @__PURE__ */ s.jsx(je.p, { id: i.descriptionId, ...r, ref: t });
  }
);
vd.displayName = bd;
var yd = "DialogClose", jd = p.forwardRef(
  (e, t) => {
    const { __scopeDialog: n, ...r } = e, i = ht(yd, n);
    return /* @__PURE__ */ s.jsx(
      je.button,
      {
        type: "button",
        ...r,
        ref: t,
        onClick: ge(e.onClick, () => i.onOpenChange(!1))
      }
    );
  }
);
jd.displayName = yd;
function Yi(e) {
  return e ? "open" : "closed";
}
var wd = "DialogTitleWarning", [qv, Nd] = bg(wd, {
  contentName: Ht,
  titleName: Ki,
  docsSlug: "dialog"
}), Fb = ({ titleId: e }) => {
  const t = Nd(wd), n = `\`${t.contentName}\` requires a \`${t.titleName}\` for the component to be accessible for screen reader users.

If you want to hide the \`${t.titleName}\`, you can wrap it with our VisuallyHidden component.

For more information, see https://radix-ui.com/primitives/docs/components/${t.docsSlug}`;
  return p.useEffect(() => {
    e && (document.getElementById(e) || console.error(n));
  }, [n, e]), null;
}, zb = "DialogDescriptionWarning", _b = ({ contentRef: e, descriptionId: t }) => {
  const r = `Warning: Missing \`Description\` or \`aria-describedby={undefined}\` for {${Nd(zb).contentName}}.`;
  return p.useEffect(() => {
    const i = e.current?.getAttribute("aria-describedby");
    t && i && (document.getElementById(t) || console.warn(r));
  }, [r, e, t]), null;
}, $b = dd, Bb = hd, Cd = fd, Sd = pd, kd = gd, Td = vd, Wb = jd;
function yn({
  ...e
}) {
  return /* @__PURE__ */ s.jsx($b, { "data-slot": "dialog", ...e });
}
function Ub({
  ...e
}) {
  return /* @__PURE__ */ s.jsx(Bb, { "data-slot": "dialog-portal", ...e });
}
const Pd = p.forwardRef(({ className: e, ...t }, n) => /* @__PURE__ */ s.jsx(
  Cd,
  {
    ref: n,
    "data-slot": "dialog-overlay",
    className: $e(
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
      e
    ),
    ...t
  }
));
Pd.displayName = Cd.displayName;
const Es = p.forwardRef(({ className: e, children: t, ...n }, r) => /* @__PURE__ */ s.jsxs(Ub, { "data-slot": "dialog-portal", children: [
  /* @__PURE__ */ s.jsx(Pd, {}),
  /* @__PURE__ */ s.jsxs(
    Sd,
    {
      ref: r,
      "data-slot": "dialog-content",
      className: $e(
        "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
        e
      ),
      ...n,
      children: [
        t,
        /* @__PURE__ */ s.jsxs(Wb, { className: "ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", children: [
          /* @__PURE__ */ s.jsx(Fn, {}),
          /* @__PURE__ */ s.jsx("span", { className: "sr-only", children: "Close" })
        ] })
      ]
    }
  )
] }));
Es.displayName = Sd.displayName;
function jn({ className: e, ...t }) {
  return /* @__PURE__ */ s.jsx(
    "div",
    {
      "data-slot": "dialog-header",
      className: $e("flex flex-col gap-2 text-center sm:text-left", e),
      ...t
    }
  );
}
const As = p.forwardRef(({ className: e, ...t }, n) => /* @__PURE__ */ s.jsx(
  kd,
  {
    ref: n,
    "data-slot": "dialog-title",
    className: $e("text-lg leading-none font-semibold", e),
    ...t
  }
));
As.displayName = kd.displayName;
const Ed = p.forwardRef(({ className: e, ...t }, n) => /* @__PURE__ */ s.jsx(
  Td,
  {
    ref: n,
    "data-slot": "dialog-description",
    className: $e("text-muted-foreground text-sm", e),
    ...t
  }
));
Ed.displayName = Td.displayName;
function Hb(e) {
  const t = e + "CollectionProvider", [n, r] = bs(t), [i, a] = n(
    t,
    { collectionRef: { current: null }, itemMap: /* @__PURE__ */ new Map() }
  ), o = (g) => {
    const { scope: N, children: j } = g, b = Y.useRef(null), y = Y.useRef(/* @__PURE__ */ new Map()).current;
    return /* @__PURE__ */ s.jsx(i, { scope: N, itemMap: y, collectionRef: b, children: j });
  };
  o.displayName = t;
  const l = e + "CollectionSlot", c = /* @__PURE__ */ Ws(l), u = Y.forwardRef(
    (g, N) => {
      const { scope: j, children: b } = g, y = a(l, j), S = Ve(N, y.collectionRef);
      return /* @__PURE__ */ s.jsx(c, { ref: S, children: b });
    }
  );
  u.displayName = l;
  const d = e + "CollectionItemSlot", m = "data-radix-collection-item", h = /* @__PURE__ */ Ws(d), f = Y.forwardRef(
    (g, N) => {
      const { scope: j, children: b, ...y } = g, S = Y.useRef(null), T = Ve(N, S), E = a(d, j);
      return Y.useEffect(() => (E.itemMap.set(S, { ref: S, ...y }), () => void E.itemMap.delete(S))), /* @__PURE__ */ s.jsx(h, { [m]: "", ref: T, children: b });
    }
  );
  f.displayName = d;
  function v(g) {
    const N = a(e + "CollectionConsumer", g);
    return Y.useCallback(() => {
      const b = N.collectionRef.current;
      if (!b) return [];
      const y = Array.from(b.querySelectorAll(`[${m}]`));
      return Array.from(N.itemMap.values()).sort(
        (E, A) => y.indexOf(E.ref.current) - y.indexOf(A.ref.current)
      );
    }, [N.collectionRef, N.itemMap]);
  }
  return [
    { Provider: o, Slot: u, ItemSlot: f },
    v,
    r
  ];
}
var Gb = p.createContext(void 0);
function qi(e) {
  const t = p.useContext(Gb);
  return e || t || "ltr";
}
var Er = "rovingFocusGroup.onEntryFocus", Kb = { bubbles: !1, cancelable: !0 }, Ys = "RovingFocusGroup", [ai, Ad, Yb] = Hb(Ys), [qb, Rd] = bs(
  Ys,
  [Yb]
), [Xb, Zb] = qb(Ys), Md = p.forwardRef(
  (e, t) => /* @__PURE__ */ s.jsx(ai.Provider, { scope: e.__scopeRovingFocusGroup, children: /* @__PURE__ */ s.jsx(ai.Slot, { scope: e.__scopeRovingFocusGroup, children: /* @__PURE__ */ s.jsx(Qb, { ...e, ref: t }) }) })
);
Md.displayName = Ys;
var Qb = p.forwardRef((e, t) => {
  const {
    __scopeRovingFocusGroup: n,
    orientation: r,
    loop: i = !1,
    dir: a,
    currentTabStopId: o,
    defaultCurrentTabStopId: l,
    onCurrentTabStopIdChange: c,
    onEntryFocus: u,
    preventScrollOnEntryFocus: d = !1,
    ...m
  } = e, h = p.useRef(null), f = Ve(t, h), v = qi(a), [g, N] = Gn({
    prop: o,
    defaultProp: l ?? null,
    onChange: c,
    caller: Ys
  }), [j, b] = p.useState(!1), y = st(u), S = Ad(n), T = p.useRef(!1), [E, A] = p.useState(0);
  return p.useEffect(() => {
    const k = h.current;
    if (k)
      return k.addEventListener(Er, y), () => k.removeEventListener(Er, y);
  }, [y]), /* @__PURE__ */ s.jsx(
    Xb,
    {
      scope: n,
      orientation: r,
      dir: v,
      loop: i,
      currentTabStopId: g,
      onItemFocus: p.useCallback(
        (k) => N(k),
        [N]
      ),
      onItemShiftTab: p.useCallback(() => b(!0), []),
      onFocusableItemAdd: p.useCallback(
        () => A((k) => k + 1),
        []
      ),
      onFocusableItemRemove: p.useCallback(
        () => A((k) => k - 1),
        []
      ),
      children: /* @__PURE__ */ s.jsx(
        je.div,
        {
          tabIndex: j || E === 0 ? -1 : 0,
          "data-orientation": r,
          ...m,
          ref: f,
          style: { outline: "none", ...e.style },
          onMouseDown: ge(e.onMouseDown, () => {
            T.current = !0;
          }),
          onFocus: ge(e.onFocus, (k) => {
            const L = !T.current;
            if (k.target === k.currentTarget && L && !j) {
              const O = new CustomEvent(Er, Kb);
              if (k.currentTarget.dispatchEvent(O), !O.defaultPrevented) {
                const q = S().filter((de) => de.focusable), P = q.find((de) => de.active), be = q.find((de) => de.id === g), pe = [P, be, ...q].filter(
                  Boolean
                ).map((de) => de.ref.current);
                Od(pe, d);
              }
            }
            T.current = !1;
          }),
          onBlur: ge(e.onBlur, () => b(!1))
        }
      )
    }
  );
}), Id = "RovingFocusGroupItem", Dd = p.forwardRef(
  (e, t) => {
    const {
      __scopeRovingFocusGroup: n,
      focusable: r = !0,
      active: i = !1,
      tabStopId: a,
      children: o,
      ...l
    } = e, c = Vs(), u = a || c, d = Zb(Id, n), m = d.currentTabStopId === u, h = Ad(n), { onFocusableItemAdd: f, onFocusableItemRemove: v, currentTabStopId: g } = d;
    return p.useEffect(() => {
      if (r)
        return f(), () => v();
    }, [r, f, v]), /* @__PURE__ */ s.jsx(
      ai.ItemSlot,
      {
        scope: n,
        id: u,
        focusable: r,
        active: i,
        children: /* @__PURE__ */ s.jsx(
          je.span,
          {
            tabIndex: m ? 0 : -1,
            "data-orientation": d.orientation,
            ...l,
            ref: t,
            onMouseDown: ge(e.onMouseDown, (N) => {
              r ? d.onItemFocus(u) : N.preventDefault();
            }),
            onFocus: ge(e.onFocus, () => d.onItemFocus(u)),
            onKeyDown: ge(e.onKeyDown, (N) => {
              if (N.key === "Tab" && N.shiftKey) {
                d.onItemShiftTab();
                return;
              }
              if (N.target !== N.currentTarget) return;
              const j = tv(N, d.orientation, d.dir);
              if (j !== void 0) {
                if (N.metaKey || N.ctrlKey || N.altKey || N.shiftKey) return;
                N.preventDefault();
                let y = h().filter((S) => S.focusable).map((S) => S.ref.current);
                if (j === "last") y.reverse();
                else if (j === "prev" || j === "next") {
                  j === "prev" && y.reverse();
                  const S = y.indexOf(N.currentTarget);
                  y = d.loop ? sv(y, S + 1) : y.slice(S + 1);
                }
                setTimeout(() => Od(y));
              }
            }),
            children: typeof o == "function" ? o({ isCurrentTabStop: m, hasTabStop: g != null }) : o
          }
        )
      }
    );
  }
);
Dd.displayName = Id;
var Jb = {
  ArrowLeft: "prev",
  ArrowUp: "prev",
  ArrowRight: "next",
  ArrowDown: "next",
  PageUp: "first",
  Home: "first",
  PageDown: "last",
  End: "last"
};
function ev(e, t) {
  return t !== "rtl" ? e : e === "ArrowLeft" ? "ArrowRight" : e === "ArrowRight" ? "ArrowLeft" : e;
}
function tv(e, t, n) {
  const r = ev(e.key, n);
  if (!(t === "vertical" && ["ArrowLeft", "ArrowRight"].includes(r)) && !(t === "horizontal" && ["ArrowUp", "ArrowDown"].includes(r)))
    return Jb[r];
}
function Od(e, t = !1) {
  const n = document.activeElement;
  for (const r of e)
    if (r === n || (r.focus({ preventScroll: t }), document.activeElement !== n)) return;
}
function sv(e, t) {
  return e.map((n, r) => e[(t + r) % e.length]);
}
var nv = Md, rv = Dd, qn = "Tabs", [iv] = bs(qn, [
  Rd
]), Vd = Rd(), [av, Xi] = iv(qn), Ld = p.forwardRef(
  (e, t) => {
    const {
      __scopeTabs: n,
      value: r,
      onValueChange: i,
      defaultValue: a,
      orientation: o = "horizontal",
      dir: l,
      activationMode: c = "automatic",
      ...u
    } = e, d = qi(l), [m, h] = Gn({
      prop: r,
      onChange: i,
      defaultProp: a ?? "",
      caller: qn
    });
    return /* @__PURE__ */ s.jsx(
      av,
      {
        scope: n,
        baseId: Vs(),
        value: m,
        onValueChange: h,
        orientation: o,
        dir: d,
        activationMode: c,
        children: /* @__PURE__ */ s.jsx(
          je.div,
          {
            dir: d,
            "data-orientation": o,
            ...u,
            ref: t
          }
        )
      }
    );
  }
);
Ld.displayName = qn;
var Fd = "TabsList", zd = p.forwardRef(
  (e, t) => {
    const { __scopeTabs: n, loop: r = !0, ...i } = e, a = Xi(Fd, n), o = Vd(n);
    return /* @__PURE__ */ s.jsx(
      nv,
      {
        asChild: !0,
        ...o,
        orientation: a.orientation,
        dir: a.dir,
        loop: r,
        children: /* @__PURE__ */ s.jsx(
          je.div,
          {
            role: "tablist",
            "aria-orientation": a.orientation,
            ...i,
            ref: t
          }
        )
      }
    );
  }
);
zd.displayName = Fd;
var _d = "TabsTrigger", $d = p.forwardRef(
  (e, t) => {
    const { __scopeTabs: n, value: r, disabled: i = !1, ...a } = e, o = Xi(_d, n), l = Vd(n), c = Ud(o.baseId, r), u = Hd(o.baseId, r), d = r === o.value;
    return /* @__PURE__ */ s.jsx(
      rv,
      {
        asChild: !0,
        ...l,
        focusable: !i,
        active: d,
        children: /* @__PURE__ */ s.jsx(
          je.button,
          {
            type: "button",
            role: "tab",
            "aria-selected": d,
            "aria-controls": u,
            "data-state": d ? "active" : "inactive",
            "data-disabled": i ? "" : void 0,
            disabled: i,
            id: c,
            ...a,
            ref: t,
            onMouseDown: ge(e.onMouseDown, (m) => {
              !i && m.button === 0 && m.ctrlKey === !1 ? o.onValueChange(r) : m.preventDefault();
            }),
            onKeyDown: ge(e.onKeyDown, (m) => {
              [" ", "Enter"].includes(m.key) && o.onValueChange(r);
            }),
            onFocus: ge(e.onFocus, () => {
              const m = o.activationMode !== "manual";
              !d && !i && m && o.onValueChange(r);
            })
          }
        )
      }
    );
  }
);
$d.displayName = _d;
var Bd = "TabsContent", Wd = p.forwardRef(
  (e, t) => {
    const { __scopeTabs: n, value: r, forceMount: i, children: a, ...o } = e, l = Xi(Bd, n), c = Ud(l.baseId, r), u = Hd(l.baseId, r), d = r === l.value, m = p.useRef(d);
    return p.useEffect(() => {
      const h = requestAnimationFrame(() => m.current = !1);
      return () => cancelAnimationFrame(h);
    }, []), /* @__PURE__ */ s.jsx(gt, { present: i || d, children: ({ present: h }) => /* @__PURE__ */ s.jsx(
      je.div,
      {
        "data-state": d ? "active" : "inactive",
        "data-orientation": l.orientation,
        role: "tabpanel",
        "aria-labelledby": c,
        hidden: !h,
        id: u,
        tabIndex: 0,
        ...o,
        ref: t,
        style: {
          ...e.style,
          animationDuration: m.current ? "0s" : void 0
        },
        children: h && a
      }
    ) });
  }
);
Wd.displayName = Bd;
function Ud(e, t) {
  return `${e}-trigger-${t}`;
}
function Hd(e, t) {
  return `${e}-content-${t}`;
}
var ov = Ld, lv = zd, cv = $d, dv = Wd;
function uv({
  className: e,
  ...t
}) {
  return /* @__PURE__ */ s.jsx(
    ov,
    {
      "data-slot": "tabs",
      className: $e("flex flex-col gap-2", e),
      ...t
    }
  );
}
function mv({
  className: e,
  ...t
}) {
  return /* @__PURE__ */ s.jsx(
    lv,
    {
      "data-slot": "tabs-list",
      className: $e(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-xl p-[3px] flex",
        e
      ),
      ...t
    }
  );
}
function wn({
  className: e,
  ...t
}) {
  return /* @__PURE__ */ s.jsx(
    cv,
    {
      "data-slot": "tabs-trigger",
      className: $e(
        "data-[state=active]:bg-card dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-xl border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        e
      ),
      ...t
    }
  );
}
function Nn({
  className: e,
  ...t
}) {
  return /* @__PURE__ */ s.jsx(
    dv,
    {
      "data-slot": "tabs-content",
      className: $e("flex-1 outline-none", e),
      ...t
    }
  );
}
function hv(e, [t, n]) {
  return Math.min(n, Math.max(t, e));
}
function fv(e, t) {
  return p.useReducer((n, r) => t[n][r] ?? n, e);
}
var Zi = "ScrollArea", [Gd] = bs(Zi), [pv, lt] = Gd(Zi), Kd = p.forwardRef(
  (e, t) => {
    const {
      __scopeScrollArea: n,
      type: r = "hover",
      dir: i,
      scrollHideDelay: a = 600,
      ...o
    } = e, [l, c] = p.useState(null), [u, d] = p.useState(null), [m, h] = p.useState(null), [f, v] = p.useState(null), [g, N] = p.useState(null), [j, b] = p.useState(0), [y, S] = p.useState(0), [T, E] = p.useState(!1), [A, k] = p.useState(!1), L = Ve(t, (q) => c(q)), O = qi(i);
    return /* @__PURE__ */ s.jsx(
      pv,
      {
        scope: n,
        type: r,
        dir: O,
        scrollHideDelay: a,
        scrollArea: l,
        viewport: u,
        onViewportChange: d,
        content: m,
        onContentChange: h,
        scrollbarX: f,
        onScrollbarXChange: v,
        scrollbarXEnabled: T,
        onScrollbarXEnabledChange: E,
        scrollbarY: g,
        onScrollbarYChange: N,
        scrollbarYEnabled: A,
        onScrollbarYEnabledChange: k,
        onCornerWidthChange: b,
        onCornerHeightChange: S,
        children: /* @__PURE__ */ s.jsx(
          je.div,
          {
            dir: O,
            ...o,
            ref: L,
            style: {
              position: "relative",
              // Pass corner sizes as CSS vars to reduce re-renders of context consumers
              "--radix-scroll-area-corner-width": j + "px",
              "--radix-scroll-area-corner-height": y + "px",
              ...e.style
            }
          }
        )
      }
    );
  }
);
Kd.displayName = Zi;
var Yd = "ScrollAreaViewport", qd = p.forwardRef(
  (e, t) => {
    const { __scopeScrollArea: n, children: r, nonce: i, ...a } = e, o = lt(Yd, n), l = p.useRef(null), c = Ve(t, l, o.onViewportChange);
    return /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
      /* @__PURE__ */ s.jsx(
        "style",
        {
          dangerouslySetInnerHTML: {
            __html: "[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}"
          },
          nonce: i
        }
      ),
      /* @__PURE__ */ s.jsx(
        je.div,
        {
          "data-radix-scroll-area-viewport": "",
          ...a,
          ref: c,
          style: {
            /**
             * We don't support `visible` because the intention is to have at least one scrollbar
             * if this component is used and `visible` will behave like `auto` in that case
             * https://developer.mozilla.org/en-US/docs/Web/CSS/overflow#description
             *
             * We don't handle `auto` because the intention is for the native implementation
             * to be hidden if using this component. We just want to ensure the node is scrollable
             * so could have used either `scroll` or `auto` here. We picked `scroll` to prevent
             * the browser from having to work out whether to render native scrollbars or not,
             * we tell it to with the intention of hiding them in CSS.
             */
            overflowX: o.scrollbarXEnabled ? "scroll" : "hidden",
            overflowY: o.scrollbarYEnabled ? "scroll" : "hidden",
            ...e.style
          },
          children: /* @__PURE__ */ s.jsx("div", { ref: o.onContentChange, style: { minWidth: "100%", display: "table" }, children: r })
        }
      )
    ] });
  }
);
qd.displayName = Yd;
var bt = "ScrollAreaScrollbar", Xd = p.forwardRef(
  (e, t) => {
    const { forceMount: n, ...r } = e, i = lt(bt, e.__scopeScrollArea), { onScrollbarXEnabledChange: a, onScrollbarYEnabledChange: o } = i, l = e.orientation === "horizontal";
    return p.useEffect(() => (l ? a(!0) : o(!0), () => {
      l ? a(!1) : o(!1);
    }), [l, a, o]), i.type === "hover" ? /* @__PURE__ */ s.jsx(xv, { ...r, ref: t, forceMount: n }) : i.type === "scroll" ? /* @__PURE__ */ s.jsx(gv, { ...r, ref: t, forceMount: n }) : i.type === "auto" ? /* @__PURE__ */ s.jsx(Zd, { ...r, ref: t, forceMount: n }) : i.type === "always" ? /* @__PURE__ */ s.jsx(Qi, { ...r, ref: t }) : null;
  }
);
Xd.displayName = bt;
var xv = p.forwardRef((e, t) => {
  const { forceMount: n, ...r } = e, i = lt(bt, e.__scopeScrollArea), [a, o] = p.useState(!1);
  return p.useEffect(() => {
    const l = i.scrollArea;
    let c = 0;
    if (l) {
      const u = () => {
        window.clearTimeout(c), o(!0);
      }, d = () => {
        c = window.setTimeout(() => o(!1), i.scrollHideDelay);
      };
      return l.addEventListener("pointerenter", u), l.addEventListener("pointerleave", d), () => {
        window.clearTimeout(c), l.removeEventListener("pointerenter", u), l.removeEventListener("pointerleave", d);
      };
    }
  }, [i.scrollArea, i.scrollHideDelay]), /* @__PURE__ */ s.jsx(gt, { present: n || a, children: /* @__PURE__ */ s.jsx(
    Zd,
    {
      "data-state": a ? "visible" : "hidden",
      ...r,
      ref: t
    }
  ) });
}), gv = p.forwardRef((e, t) => {
  const { forceMount: n, ...r } = e, i = lt(bt, e.__scopeScrollArea), a = e.orientation === "horizontal", o = Zn(() => c("SCROLL_END"), 100), [l, c] = fv("hidden", {
    hidden: {
      SCROLL: "scrolling"
    },
    scrolling: {
      SCROLL_END: "idle",
      POINTER_ENTER: "interacting"
    },
    interacting: {
      SCROLL: "interacting",
      POINTER_LEAVE: "idle"
    },
    idle: {
      HIDE: "hidden",
      SCROLL: "scrolling",
      POINTER_ENTER: "interacting"
    }
  });
  return p.useEffect(() => {
    if (l === "idle") {
      const u = window.setTimeout(() => c("HIDE"), i.scrollHideDelay);
      return () => window.clearTimeout(u);
    }
  }, [l, i.scrollHideDelay, c]), p.useEffect(() => {
    const u = i.viewport, d = a ? "scrollLeft" : "scrollTop";
    if (u) {
      let m = u[d];
      const h = () => {
        const f = u[d];
        m !== f && (c("SCROLL"), o()), m = f;
      };
      return u.addEventListener("scroll", h), () => u.removeEventListener("scroll", h);
    }
  }, [i.viewport, a, c, o]), /* @__PURE__ */ s.jsx(gt, { present: n || l !== "hidden", children: /* @__PURE__ */ s.jsx(
    Qi,
    {
      "data-state": l === "hidden" ? "hidden" : "visible",
      ...r,
      ref: t,
      onPointerEnter: ge(e.onPointerEnter, () => c("POINTER_ENTER")),
      onPointerLeave: ge(e.onPointerLeave, () => c("POINTER_LEAVE"))
    }
  ) });
}), Zd = p.forwardRef((e, t) => {
  const n = lt(bt, e.__scopeScrollArea), { forceMount: r, ...i } = e, [a, o] = p.useState(!1), l = e.orientation === "horizontal", c = Zn(() => {
    if (n.viewport) {
      const u = n.viewport.offsetWidth < n.viewport.scrollWidth, d = n.viewport.offsetHeight < n.viewport.scrollHeight;
      o(l ? u : d);
    }
  }, 10);
  return ds(n.viewport, c), ds(n.content, c), /* @__PURE__ */ s.jsx(gt, { present: r || a, children: /* @__PURE__ */ s.jsx(
    Qi,
    {
      "data-state": a ? "visible" : "hidden",
      ...i,
      ref: t
    }
  ) });
}), Qi = p.forwardRef((e, t) => {
  const { orientation: n = "vertical", ...r } = e, i = lt(bt, e.__scopeScrollArea), a = p.useRef(null), o = p.useRef(0), [l, c] = p.useState({
    content: 0,
    viewport: 0,
    scrollbar: { size: 0, paddingStart: 0, paddingEnd: 0 }
  }), u = su(l.viewport, l.content), d = {
    ...r,
    sizes: l,
    onSizesChange: c,
    hasThumb: u > 0 && u < 1,
    onThumbChange: (h) => a.current = h,
    onThumbPointerUp: () => o.current = 0,
    onThumbPointerDown: (h) => o.current = h
  };
  function m(h, f) {
    return Nv(h, o.current, l, f);
  }
  return n === "horizontal" ? /* @__PURE__ */ s.jsx(
    bv,
    {
      ...d,
      ref: t,
      onThumbPositionChange: () => {
        if (i.viewport && a.current) {
          const h = i.viewport.scrollLeft, f = Go(h, l, i.dir);
          a.current.style.transform = `translate3d(${f}px, 0, 0)`;
        }
      },
      onWheelScroll: (h) => {
        i.viewport && (i.viewport.scrollLeft = h);
      },
      onDragScroll: (h) => {
        i.viewport && (i.viewport.scrollLeft = m(h, i.dir));
      }
    }
  ) : n === "vertical" ? /* @__PURE__ */ s.jsx(
    vv,
    {
      ...d,
      ref: t,
      onThumbPositionChange: () => {
        if (i.viewport && a.current) {
          const h = i.viewport.scrollTop, f = Go(h, l);
          a.current.style.transform = `translate3d(0, ${f}px, 0)`;
        }
      },
      onWheelScroll: (h) => {
        i.viewport && (i.viewport.scrollTop = h);
      },
      onDragScroll: (h) => {
        i.viewport && (i.viewport.scrollTop = m(h));
      }
    }
  ) : null;
}), bv = p.forwardRef((e, t) => {
  const { sizes: n, onSizesChange: r, ...i } = e, a = lt(bt, e.__scopeScrollArea), [o, l] = p.useState(), c = p.useRef(null), u = Ve(t, c, a.onScrollbarXChange);
  return p.useEffect(() => {
    c.current && l(getComputedStyle(c.current));
  }, [c]), /* @__PURE__ */ s.jsx(
    Jd,
    {
      "data-orientation": "horizontal",
      ...i,
      ref: u,
      sizes: n,
      style: {
        bottom: 0,
        left: a.dir === "rtl" ? "var(--radix-scroll-area-corner-width)" : 0,
        right: a.dir === "ltr" ? "var(--radix-scroll-area-corner-width)" : 0,
        "--radix-scroll-area-thumb-width": Xn(n) + "px",
        ...e.style
      },
      onThumbPointerDown: (d) => e.onThumbPointerDown(d.x),
      onDragScroll: (d) => e.onDragScroll(d.x),
      onWheelScroll: (d, m) => {
        if (a.viewport) {
          const h = a.viewport.scrollLeft + d.deltaX;
          e.onWheelScroll(h), ru(h, m) && d.preventDefault();
        }
      },
      onResize: () => {
        c.current && a.viewport && o && r({
          content: a.viewport.scrollWidth,
          viewport: a.viewport.offsetWidth,
          scrollbar: {
            size: c.current.clientWidth,
            paddingStart: $n(o.paddingLeft),
            paddingEnd: $n(o.paddingRight)
          }
        });
      }
    }
  );
}), vv = p.forwardRef((e, t) => {
  const { sizes: n, onSizesChange: r, ...i } = e, a = lt(bt, e.__scopeScrollArea), [o, l] = p.useState(), c = p.useRef(null), u = Ve(t, c, a.onScrollbarYChange);
  return p.useEffect(() => {
    c.current && l(getComputedStyle(c.current));
  }, [c]), /* @__PURE__ */ s.jsx(
    Jd,
    {
      "data-orientation": "vertical",
      ...i,
      ref: u,
      sizes: n,
      style: {
        top: 0,
        right: a.dir === "ltr" ? 0 : void 0,
        left: a.dir === "rtl" ? 0 : void 0,
        bottom: "var(--radix-scroll-area-corner-height)",
        "--radix-scroll-area-thumb-height": Xn(n) + "px",
        ...e.style
      },
      onThumbPointerDown: (d) => e.onThumbPointerDown(d.y),
      onDragScroll: (d) => e.onDragScroll(d.y),
      onWheelScroll: (d, m) => {
        if (a.viewport) {
          const h = a.viewport.scrollTop + d.deltaY;
          e.onWheelScroll(h), ru(h, m) && d.preventDefault();
        }
      },
      onResize: () => {
        c.current && a.viewport && o && r({
          content: a.viewport.scrollHeight,
          viewport: a.viewport.offsetHeight,
          scrollbar: {
            size: c.current.clientHeight,
            paddingStart: $n(o.paddingTop),
            paddingEnd: $n(o.paddingBottom)
          }
        });
      }
    }
  );
}), [yv, Qd] = Gd(bt), Jd = p.forwardRef((e, t) => {
  const {
    __scopeScrollArea: n,
    sizes: r,
    hasThumb: i,
    onThumbChange: a,
    onThumbPointerUp: o,
    onThumbPointerDown: l,
    onThumbPositionChange: c,
    onDragScroll: u,
    onWheelScroll: d,
    onResize: m,
    ...h
  } = e, f = lt(bt, n), [v, g] = p.useState(null), N = Ve(t, (L) => g(L)), j = p.useRef(null), b = p.useRef(""), y = f.viewport, S = r.content - r.viewport, T = st(d), E = st(c), A = Zn(m, 10);
  function k(L) {
    if (j.current) {
      const O = L.clientX - j.current.left, q = L.clientY - j.current.top;
      u({ x: O, y: q });
    }
  }
  return p.useEffect(() => {
    const L = (O) => {
      const q = O.target;
      v?.contains(q) && T(O, S);
    };
    return document.addEventListener("wheel", L, { passive: !1 }), () => document.removeEventListener("wheel", L, { passive: !1 });
  }, [y, v, S, T]), p.useEffect(E, [r, E]), ds(v, A), ds(f.content, A), /* @__PURE__ */ s.jsx(
    yv,
    {
      scope: n,
      scrollbar: v,
      hasThumb: i,
      onThumbChange: st(a),
      onThumbPointerUp: st(o),
      onThumbPositionChange: E,
      onThumbPointerDown: st(l),
      children: /* @__PURE__ */ s.jsx(
        je.div,
        {
          ...h,
          ref: N,
          style: { position: "absolute", ...h.style },
          onPointerDown: ge(e.onPointerDown, (L) => {
            L.button === 0 && (L.target.setPointerCapture(L.pointerId), j.current = v.getBoundingClientRect(), b.current = document.body.style.webkitUserSelect, document.body.style.webkitUserSelect = "none", f.viewport && (f.viewport.style.scrollBehavior = "auto"), k(L));
          }),
          onPointerMove: ge(e.onPointerMove, k),
          onPointerUp: ge(e.onPointerUp, (L) => {
            const O = L.target;
            O.hasPointerCapture(L.pointerId) && O.releasePointerCapture(L.pointerId), document.body.style.webkitUserSelect = b.current, f.viewport && (f.viewport.style.scrollBehavior = ""), j.current = null;
          })
        }
      )
    }
  );
}), _n = "ScrollAreaThumb", eu = p.forwardRef(
  (e, t) => {
    const { forceMount: n, ...r } = e, i = Qd(_n, e.__scopeScrollArea);
    return /* @__PURE__ */ s.jsx(gt, { present: n || i.hasThumb, children: /* @__PURE__ */ s.jsx(jv, { ref: t, ...r }) });
  }
), jv = p.forwardRef(
  (e, t) => {
    const { __scopeScrollArea: n, style: r, ...i } = e, a = lt(_n, n), o = Qd(_n, n), { onThumbPositionChange: l } = o, c = Ve(
      t,
      (m) => o.onThumbChange(m)
    ), u = p.useRef(void 0), d = Zn(() => {
      u.current && (u.current(), u.current = void 0);
    }, 100);
    return p.useEffect(() => {
      const m = a.viewport;
      if (m) {
        const h = () => {
          if (d(), !u.current) {
            const f = Cv(m, l);
            u.current = f, l();
          }
        };
        return l(), m.addEventListener("scroll", h), () => m.removeEventListener("scroll", h);
      }
    }, [a.viewport, d, l]), /* @__PURE__ */ s.jsx(
      je.div,
      {
        "data-state": o.hasThumb ? "visible" : "hidden",
        ...i,
        ref: c,
        style: {
          width: "var(--radix-scroll-area-thumb-width)",
          height: "var(--radix-scroll-area-thumb-height)",
          ...r
        },
        onPointerDownCapture: ge(e.onPointerDownCapture, (m) => {
          const f = m.target.getBoundingClientRect(), v = m.clientX - f.left, g = m.clientY - f.top;
          o.onThumbPointerDown({ x: v, y: g });
        }),
        onPointerUp: ge(e.onPointerUp, o.onThumbPointerUp)
      }
    );
  }
);
eu.displayName = _n;
var Ji = "ScrollAreaCorner", tu = p.forwardRef(
  (e, t) => {
    const n = lt(Ji, e.__scopeScrollArea), r = !!(n.scrollbarX && n.scrollbarY);
    return n.type !== "scroll" && r ? /* @__PURE__ */ s.jsx(wv, { ...e, ref: t }) : null;
  }
);
tu.displayName = Ji;
var wv = p.forwardRef((e, t) => {
  const { __scopeScrollArea: n, ...r } = e, i = lt(Ji, n), [a, o] = p.useState(0), [l, c] = p.useState(0), u = !!(a && l);
  return ds(i.scrollbarX, () => {
    const d = i.scrollbarX?.offsetHeight || 0;
    i.onCornerHeightChange(d), c(d);
  }), ds(i.scrollbarY, () => {
    const d = i.scrollbarY?.offsetWidth || 0;
    i.onCornerWidthChange(d), o(d);
  }), u ? /* @__PURE__ */ s.jsx(
    je.div,
    {
      ...r,
      ref: t,
      style: {
        width: a,
        height: l,
        position: "absolute",
        right: i.dir === "ltr" ? 0 : void 0,
        left: i.dir === "rtl" ? 0 : void 0,
        bottom: 0,
        ...e.style
      }
    }
  ) : null;
});
function $n(e) {
  return e ? parseInt(e, 10) : 0;
}
function su(e, t) {
  const n = e / t;
  return isNaN(n) ? 0 : n;
}
function Xn(e) {
  const t = su(e.viewport, e.content), n = e.scrollbar.paddingStart + e.scrollbar.paddingEnd, r = (e.scrollbar.size - n) * t;
  return Math.max(r, 18);
}
function Nv(e, t, n, r = "ltr") {
  const i = Xn(n), a = i / 2, o = t || a, l = i - o, c = n.scrollbar.paddingStart + o, u = n.scrollbar.size - n.scrollbar.paddingEnd - l, d = n.content - n.viewport, m = r === "ltr" ? [0, d] : [d * -1, 0];
  return nu([c, u], m)(e);
}
function Go(e, t, n = "ltr") {
  const r = Xn(t), i = t.scrollbar.paddingStart + t.scrollbar.paddingEnd, a = t.scrollbar.size - i, o = t.content - t.viewport, l = a - r, c = n === "ltr" ? [0, o] : [o * -1, 0], u = hv(e, c);
  return nu([0, o], [0, l])(u);
}
function nu(e, t) {
  return (n) => {
    if (e[0] === e[1] || t[0] === t[1]) return t[0];
    const r = (t[1] - t[0]) / (e[1] - e[0]);
    return t[0] + r * (n - e[0]);
  };
}
function ru(e, t) {
  return e > 0 && e < t;
}
var Cv = (e, t = () => {
}) => {
  let n = { left: e.scrollLeft, top: e.scrollTop }, r = 0;
  return (function i() {
    const a = { left: e.scrollLeft, top: e.scrollTop }, o = n.left !== a.left, l = n.top !== a.top;
    (o || l) && t(), n = a, r = window.requestAnimationFrame(i);
  })(), () => window.cancelAnimationFrame(r);
};
function Zn(e, t) {
  const n = st(e), r = p.useRef(0);
  return p.useEffect(() => () => window.clearTimeout(r.current), []), p.useCallback(() => {
    window.clearTimeout(r.current), r.current = window.setTimeout(n, t);
  }, [n, t]);
}
function ds(e, t) {
  const n = st(t);
  Ut(() => {
    let r = 0;
    if (e) {
      const i = new ResizeObserver(() => {
        cancelAnimationFrame(r), r = window.requestAnimationFrame(n);
      });
      return i.observe(e), () => {
        window.cancelAnimationFrame(r), i.unobserve(e);
      };
    }
  }, [e, n]);
}
var Sv = Kd, kv = qd, Tv = tu;
function Ar({
  className: e,
  children: t,
  ...n
}) {
  return /* @__PURE__ */ s.jsxs(
    Sv,
    {
      "data-slot": "scroll-area",
      className: $e("relative", e),
      ...n,
      children: [
        /* @__PURE__ */ s.jsx(
          kv,
          {
            "data-slot": "scroll-area-viewport",
            className: "focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1",
            children: t
          }
        ),
        /* @__PURE__ */ s.jsx(Pv, {}),
        /* @__PURE__ */ s.jsx(Tv, {})
      ]
    }
  );
}
function Pv({
  className: e,
  orientation: t = "vertical",
  ...n
}) {
  return /* @__PURE__ */ s.jsx(
    Xd,
    {
      "data-slot": "scroll-area-scrollbar",
      orientation: t,
      className: $e(
        "flex touch-none p-px transition-colors select-none",
        t === "vertical" && "h-full w-2.5 border-l border-l-transparent",
        t === "horizontal" && "h-2.5 flex-col border-t border-t-transparent",
        e
      ),
      ...n,
      children: /* @__PURE__ */ s.jsx(
        eu,
        {
          "data-slot": "scroll-area-thumb",
          className: "bg-border relative flex-1 rounded-full"
        }
      )
    }
  );
}
function Ev(e) {
  const t = p.useRef({ value: e, previous: e });
  return p.useMemo(() => (t.current.value !== e && (t.current.previous = t.current.value, t.current.value = e), t.current.previous), [e]);
}
function Av(e) {
  const [t, n] = p.useState(void 0);
  return Ut(() => {
    if (e) {
      n({ width: e.offsetWidth, height: e.offsetHeight });
      const r = new ResizeObserver((i) => {
        if (!Array.isArray(i) || !i.length)
          return;
        const a = i[0];
        let o, l;
        if ("borderBoxSize" in a) {
          const c = a.borderBoxSize, u = Array.isArray(c) ? c[0] : c;
          o = u.inlineSize, l = u.blockSize;
        } else
          o = e.offsetWidth, l = e.offsetHeight;
        n({ width: o, height: l });
      });
      return r.observe(e, { box: "border-box" }), () => r.unobserve(e);
    } else
      n(void 0);
  }, [e]), t;
}
var Qn = "Checkbox", [Rv] = bs(Qn), [Mv, ea] = Rv(Qn);
function Iv(e) {
  const {
    __scopeCheckbox: t,
    checked: n,
    children: r,
    defaultChecked: i,
    disabled: a,
    form: o,
    name: l,
    onCheckedChange: c,
    required: u,
    value: d = "on",
    // @ts-expect-error
    internal_do_not_use_render: m
  } = e, [h, f] = Gn({
    prop: n,
    defaultProp: i ?? !1,
    onChange: c,
    caller: Qn
  }), [v, g] = p.useState(null), [N, j] = p.useState(null), b = p.useRef(!1), y = v ? !!o || !!v.closest("form") : (
    // We set this to true by default so that events bubble to forms without JS (SSR)
    !0
  ), S = {
    checked: h,
    disabled: a,
    setChecked: f,
    control: v,
    setControl: g,
    name: l,
    form: o,
    value: d,
    hasConsumerStoppedPropagationRef: b,
    required: u,
    defaultChecked: At(i) ? !1 : i,
    isFormControl: y,
    bubbleInput: N,
    setBubbleInput: j
  };
  return /* @__PURE__ */ s.jsx(
    Mv,
    {
      scope: t,
      ...S,
      children: Dv(m) ? m(S) : r
    }
  );
}
var iu = "CheckboxTrigger", au = p.forwardRef(
  ({ __scopeCheckbox: e, onKeyDown: t, onClick: n, ...r }, i) => {
    const {
      control: a,
      value: o,
      disabled: l,
      checked: c,
      required: u,
      setControl: d,
      setChecked: m,
      hasConsumerStoppedPropagationRef: h,
      isFormControl: f,
      bubbleInput: v
    } = ea(iu, e), g = Ve(i, d), N = p.useRef(c);
    return p.useEffect(() => {
      const j = a?.form;
      if (j) {
        const b = () => m(N.current);
        return j.addEventListener("reset", b), () => j.removeEventListener("reset", b);
      }
    }, [a, m]), /* @__PURE__ */ s.jsx(
      je.button,
      {
        type: "button",
        role: "checkbox",
        "aria-checked": At(c) ? "mixed" : c,
        "aria-required": u,
        "data-state": mu(c),
        "data-disabled": l ? "" : void 0,
        disabled: l,
        value: o,
        ...r,
        ref: g,
        onKeyDown: ge(t, (j) => {
          j.key === "Enter" && j.preventDefault();
        }),
        onClick: ge(n, (j) => {
          m((b) => At(b) ? !0 : !b), v && f && (h.current = j.isPropagationStopped(), h.current || j.stopPropagation());
        })
      }
    );
  }
);
au.displayName = iu;
var ou = p.forwardRef(
  (e, t) => {
    const {
      __scopeCheckbox: n,
      name: r,
      checked: i,
      defaultChecked: a,
      required: o,
      disabled: l,
      value: c,
      onCheckedChange: u,
      form: d,
      ...m
    } = e;
    return /* @__PURE__ */ s.jsx(
      Iv,
      {
        __scopeCheckbox: n,
        checked: i,
        defaultChecked: a,
        disabled: l,
        required: o,
        onCheckedChange: u,
        name: r,
        form: d,
        value: c,
        internal_do_not_use_render: ({ isFormControl: h }) => /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
          /* @__PURE__ */ s.jsx(
            au,
            {
              ...m,
              ref: t,
              __scopeCheckbox: n
            }
          ),
          h && /* @__PURE__ */ s.jsx(
            uu,
            {
              __scopeCheckbox: n
            }
          )
        ] })
      }
    );
  }
);
ou.displayName = Qn;
var lu = "CheckboxIndicator", cu = p.forwardRef(
  (e, t) => {
    const { __scopeCheckbox: n, forceMount: r, ...i } = e, a = ea(lu, n);
    return /* @__PURE__ */ s.jsx(
      gt,
      {
        present: r || At(a.checked) || a.checked === !0,
        children: /* @__PURE__ */ s.jsx(
          je.span,
          {
            "data-state": mu(a.checked),
            "data-disabled": a.disabled ? "" : void 0,
            ...i,
            ref: t,
            style: { pointerEvents: "none", ...e.style }
          }
        )
      }
    );
  }
);
cu.displayName = lu;
var du = "CheckboxBubbleInput", uu = p.forwardRef(
  ({ __scopeCheckbox: e, ...t }, n) => {
    const {
      control: r,
      hasConsumerStoppedPropagationRef: i,
      checked: a,
      defaultChecked: o,
      required: l,
      disabled: c,
      name: u,
      value: d,
      form: m,
      bubbleInput: h,
      setBubbleInput: f
    } = ea(du, e), v = Ve(n, f), g = Ev(a), N = Av(r);
    p.useEffect(() => {
      const b = h;
      if (!b) return;
      const y = window.HTMLInputElement.prototype, T = Object.getOwnPropertyDescriptor(
        y,
        "checked"
      ).set, E = !i.current;
      if (g !== a && T) {
        const A = new Event("click", { bubbles: E });
        b.indeterminate = At(a), T.call(b, At(a) ? !1 : a), b.dispatchEvent(A);
      }
    }, [h, g, a, i]);
    const j = p.useRef(At(a) ? !1 : a);
    return /* @__PURE__ */ s.jsx(
      je.input,
      {
        type: "checkbox",
        "aria-hidden": !0,
        defaultChecked: o ?? j.current,
        required: l,
        disabled: c,
        name: u,
        value: d,
        form: m,
        ...t,
        tabIndex: -1,
        ref: v,
        style: {
          ...t.style,
          ...N,
          position: "absolute",
          pointerEvents: "none",
          opacity: 0,
          margin: 0,
          // We transform because the input is absolutely positioned but we have
          // rendered it **after** the button. This pulls it back to sit on top
          // of the button.
          transform: "translateX(-100%)"
        }
      }
    );
  }
);
uu.displayName = du;
function Dv(e) {
  return typeof e == "function";
}
function At(e) {
  return e === "indeterminate";
}
function mu(e) {
  return At(e) ? "indeterminate" : e ? "checked" : "unchecked";
}
function Ov({
  className: e,
  ...t
}) {
  return /* @__PURE__ */ s.jsx(
    ou,
    {
      "data-slot": "checkbox",
      className: $e(
        "peer border bg-input-background dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        e
      ),
      ...t,
      children: /* @__PURE__ */ s.jsx(
        cu,
        {
          "data-slot": "checkbox-indicator",
          className: "flex items-center justify-center text-current transition-none",
          children: /* @__PURE__ */ s.jsx(_e, { className: "size-3.5" })
        }
      )
    }
  );
}
function Vv({ className: e, ...t }) {
  return /* @__PURE__ */ s.jsx(
    "textarea",
    {
      "data-slot": "textarea",
      className: $e(
        "resize-none border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-input-background px-3 py-2 text-base transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        e
      ),
      ...t
    }
  );
}
function Lv({
  originalContent: e,
  aiEnhancedContent: t,
  patientSummaryContent: n,
  patientMetadata: r,
  transcriptEntries: i,
  selectedCodes: a,
  suggestedCodes: o,
  reimbursementSummary: l,
  onAcceptAllChanges: c,
  onReBeautify: u,
  onContentChange: d,
  onNavigateNext: m,
  onNavigatePrevious: h
}) {
  const [f, v] = ve("enhanced"), [g, N] = ve(e), [j, b] = ve(t), [y, S] = ve(n), [T, E] = ve({
    enhanced: !1,
    summary: !1
  }), [A, k] = ve(!1), [L, O] = ve(!1), [q, P] = ve(!1), [be, me] = ve([
    { id: 1, text: "Follow-up appointment in 2 weeks", checked: !1 },
    { id: 2, text: "Lab work - CBC and comprehensive metabolic panel", checked: !1 },
    { id: 3, text: "Patient education on medication compliance", checked: !1 },
    { id: 4, text: "Order ECG and cardiac enzymes", checked: !1 },
    { id: 5, text: "Schedule cardiology consultation", checked: !1 },
    { id: 6, text: "Order chest X-ray", checked: !1 }
  ]), [pe, de] = ve(""), re = at(null), w = at(null), B = (C) => {
    const R = C.target.value;
    N(R), d?.(R, "original");
  }, W = (C) => {
    const R = C.target.value;
    f === "enhanced" ? (b(R), d?.(R, "enhanced")) : (S(R), d?.(R, "summary"));
  }, G = () => f === "enhanced" ? j : y, oe = f === "enhanced" ? {
    background: "linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)",
    headerClass: "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200",
    headerTextClass: "text-blue-800",
    footerClass: "border-blue-200 bg-blue-50/50"
  } : {
    background: "linear-gradient(135deg, #fafaff 0%, #f8f8fd 25%, #f6f6fb 50%, #f4f4f9 75%, #fafaff 100%)",
    headerClass: "bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200",
    headerTextClass: "text-violet-800",
    footerClass: "border-violet-200 bg-violet-50/50"
  }, ee = () => {
    E((C) => ({
      ...C,
      [f]: !C[f]
      // Toggle acceptance
    }));
  }, Z = T[f], we = T.enhanced && T.summary, le = (C) => {
    me((R) => R.map(
      ($) => $.id === C ? { ...$, checked: !$.checked } : $
    ));
  }, Le = () => {
    if (pe.trim()) {
      const C = {
        id: Date.now(),
        text: pe.trim(),
        checked: !1
      };
      me((R) => [...R, C]), de("");
    }
  }, He = (C) => {
    if (typeof C == "number" && Number.isFinite(C)) {
      const R = Math.max(0, Math.round(C)), $ = Math.floor(R / 60).toString().padStart(2, "0"), F = (R % 60).toString().padStart(2, "0");
      return `${$}:${F}`;
    }
    return typeof C == "string" && C.trim().length > 0 ? C.trim() : null;
  }, Ge = ke(() => r?.name && String(r.name).trim().length > 0 ? String(r.name).trim() : "Patient", [r?.name]), Qe = ke(() => {
    const C = [];
    return r?.patientId && String(r.patientId).trim().length > 0 && C.push(`ID ${String(r.patientId).trim()}`), r?.encounterDate && String(r.encounterDate).trim().length > 0 && C.push(new Date(String(r.encounterDate)).toLocaleDateString()), C.length ? C.join(" • ") : "Encounter details pending";
  }, [r?.patientId, r?.encounterDate]), tt = ke(() => r?.providerName && String(r.providerName).trim().length > 0 ? String(r.providerName).trim() : "Assigned Provider", [r?.providerName]), Dt = ke(() => (Array.isArray(i) ? i : []).filter((R) => typeof R?.text == "string" && R.text.trim().length > 0).slice(-8).map((R, $) => {
    const F = typeof R?.speaker == "string" && R.speaker.trim().length > 0 ? R.speaker.trim() : $ % 2 === 0 ? "Provider" : "Patient", ue = He(R?.timestamp), De = String(R?.text ?? "").trim(), Ye = typeof R?.confidence == "number" && Number.isFinite(R.confidence) ? Math.round(Math.max(0, Math.min(1, R.confidence)) * 100) : null;
    return {
      id: R?.id ?? $,
      speaker: F,
      text: De,
      timestamp: ue,
      confidence: Ye,
      isProvider: F.toLowerCase().includes("doctor") || F.toLowerCase().includes("provider")
    };
  }), [i]), I = ke(() => Array.isArray(a) ? a.filter((C) => C?.code || C?.title) : [], [a]), K = ke(() => {
    const C = typeof l?.total == "number" ? l.total : I.length * 0, R = Array.isArray(l?.codes) ? l.codes : [];
    return {
      total: C,
      codes: R,
      formattedTotal: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(Math.max(0, C || 0))
    };
  }, [l, I.length]), ae = ke(() => I.length ? I[0]?.code || I[0]?.title || "Code" : "N/A", [I]), Te = ke(() => {
    if (!I.length)
      return "Primary Code";
    const C = kt(I[0]);
    return C === "CPT" ? "Primary CPT Code" : C === "ICD-10" ? "Primary Diagnosis Code" : "Primary Code";
  }, [I]), X = ke(() => new Set(
    I.map((C) => (C?.code || C?.title || "").toString().toUpperCase()).filter(Boolean)
  ), [I]), se = ke(() => {
    const C = { high: [], medium: [], low: [] };
    return Array.isArray(o) && o.forEach((R) => {
      const $ = (R?.code || R?.title || "").toString().toUpperCase();
      if (!$ || X.has($))
        return;
      const F = typeof R?.confidence == "number" ? R.confidence : 0, ue = F > 1 ? F : F * 100;
      ue >= 80 ? C.high.push(R) : ue >= 50 ? C.medium.push(R) : C.low.push(R);
    }), C;
  }, [o, X]), he = ke(() => I.filter(
    (C) => (C?.codeType || C?.category || "").toString().toUpperCase() !== "CPT"
  ), [I]), Se = ke(() => I.filter(
    (C) => (C?.codeType || C?.category || "").toString().toUpperCase() === "CPT"
  ), [I]);
  function ct(C) {
    if (typeof C != "number" || !Number.isFinite(C))
      return null;
    const R = C > 1 ? C : C * 100;
    return `${Math.max(0, Math.min(100, Math.round(R)))}%`;
  }
  function kt(C) {
    const R = typeof C?.codeType == "string" ? C.codeType.trim() : "";
    if (R)
      return R.toUpperCase();
    const $ = typeof C?.code == "string" ? C.code.trim() : "";
    return /^\d{4,5}$/.test($) ? "CPT" : $ ? "ICD-10" : "CODE";
  }
  function vt(C) {
    return C.toUpperCase() === "CPT" ? "bg-green-50 text-green-700 border border-green-200 text-xs flex-shrink-0" : "bg-blue-50 text-blue-700 border border-blue-200 text-xs flex-shrink-0";
  }
  function Gt(C, R) {
    if (C.stillValid === !1)
      return { text: "Needs Update", className: "bg-red-100 text-red-700 text-xs" };
    const $ = typeof C.status == "string" ? C.status.toLowerCase() : "";
    return $ === "completed" || $ === "confirmed" ? {
      text: R === 0 ? "Primary" : "Confirmed",
      className: "bg-emerald-100 text-emerald-700 text-xs"
    } : $ === "in-progress" ? { text: "In Progress", className: "bg-amber-100 text-amber-700 text-xs" } : {
      text: R === 0 ? "Primary" : "Pending Review",
      className: R === 0 ? "bg-green-100 text-green-800 text-xs" : "bg-slate-100 text-slate-700 text-xs"
    };
  }
  function qs(C) {
    const R = C.replace(/[\-_]+/g, " ").trim();
    return R ? R.replace(/\b\w/g, ($) => $.toUpperCase()) : C;
  }
  function Xs(C) {
    const R = /* @__PURE__ */ new Set(), $ = (F) => {
      if (typeof F == "string") {
        const ue = F.trim();
        ue && R.add(ue);
      }
    };
    return Array.isArray(C.tags) && C.tags.forEach((F) => $(typeof F == "string" ? F : String(F))), Array.isArray(C.classification) ? C.classification.forEach((F) => $(typeof F == "string" ? F : String(F))) : typeof C.classification == "string" && $(C.classification), $(typeof C.category == "string" ? C.category : void 0), Array.from(R.values()).slice(0, 4);
  }
  function Zs(C) {
    const R = [C.docSupport, C.details, C.aiReasoning];
    for (const $ of R)
      if (typeof $ == "string") {
        const F = $.trim();
        if (F)
          return F;
      }
    if (Array.isArray(C.evidence)) {
      const $ = C.evidence.filter((F) => typeof F == "string" && F.trim().length > 0).map((F) => F.trim());
      if ($.length)
        return `Evidence: ${$.slice(0, 2).join("; ")}`;
    }
    if (Array.isArray(C.gaps)) {
      const $ = C.gaps.filter((F) => typeof F == "string" && F.trim().length > 0).map((F) => F.trim());
      if ($.length)
        return `Gaps: ${$.slice(0, 2).join("; ")}`;
    }
  }
  const Qs = (C) => {
    const R = [], $ = ct(C.confidence);
    if ($ && R.push(`Confidence ${$}`), typeof C.reimbursement == "number" && Number.isFinite(C.reimbursement))
      R.push(`Est. reimbursement $${C.reimbursement.toLocaleString()}`);
    else if (typeof C.reimbursement == "string") {
      const F = Number(C.reimbursement.replace(/[^0-9.-]/g, ""));
      Number.isFinite(F) && F !== 0 && R.push(`Est. reimbursement $${Math.abs(F).toLocaleString()}`);
    }
    if (typeof C.rvu == "number" && Number.isFinite(C.rvu))
      R.push(`RVU ${C.rvu.toFixed(2)}`);
    else if (typeof C.rvu == "string") {
      const F = C.rvu.trim();
      F && R.push(`RVU ${F}`);
    }
    return R;
  }, vs = (C, R) => {
    const $ = (C.code || C.title || `Code ${R + 1}`).toString(), F = C.title || C.description || "No description provided.", ue = Zs(C), De = Gt(C, R), Ye = kt(C), qe = Xs(C), Ae = Qs(C);
    return /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: [
      /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between mb-2 gap-3", children: [
        /* @__PURE__ */ s.jsx("span", { className: "font-medium text-sm text-slate-800", children: $ }),
        /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ s.jsx(Be, { className: De.className, children: De.text }),
          /* @__PURE__ */ s.jsx(Be, { className: `${vt(Ye)} text-xs`, children: Ye })
        ] })
      ] }),
      /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-700 mb-1", children: F }),
      ue && /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600", children: ue }),
      qe.length > 0 && /* @__PURE__ */ s.jsx("div", { className: "flex flex-wrap gap-2 pt-2", children: qe.map((Fe) => /* @__PURE__ */ s.jsx(Be, { variant: "outline", className: "text-[10px] uppercase tracking-wide", children: qs(Fe) }, Fe)) }),
      Ae.length > 0 && /* @__PURE__ */ s.jsx("div", { className: "flex flex-wrap gap-2 pt-2 text-[11px] text-slate-500", children: Ae.map((Fe) => /* @__PURE__ */ s.jsx("span", { className: "bg-slate-100 px-2 py-1 rounded-full", children: Fe }, Fe)) })
    ] }, `${C.id ?? $}-${R}`);
  }, Ke = ke(() => {
    const C = ["high", "medium", "low"];
    let R = 0, $ = 0, F = 0, ue = 0, De = !1;
    return C.forEach((Ye) => {
      const qe = se[Ye];
      R += qe.length, qe.forEach((Ae) => {
        if (typeof Ae.confidence == "number" && Number.isFinite(Ae.confidence)) {
          const Fe = Ae.confidence > 1 ? Ae.confidence : Ae.confidence * 100;
          $ += Math.max(0, Math.min(100, Fe)), F += 1;
        }
        if (typeof Ae.reimbursement == "number" && Number.isFinite(Ae.reimbursement))
          ue += Ae.reimbursement, De = !0;
        else if (typeof Ae.reimbursement == "string") {
          const Fe = Number(Ae.reimbursement.replace(/[^0-9.-]/g, ""));
          Number.isFinite(Fe) && Fe !== 0 && (ue += Fe, De = !0);
        }
      });
    }), {
      total: R,
      high: se.high.length,
      medium: se.medium.length,
      low: se.low.length,
      averageConfidence: F ? $ / F : null,
      revenueTotal: ue,
      hasRevenue: De
    };
  }, [se]), Js = ke(() => Ke.hasRevenue ? new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Math.max(0, Ke.revenueTotal)) : "—", [Ke.hasRevenue, Ke.revenueTotal]), en = ke(() => Ke.averageConfidence === null ? "—" : `${Math.round(Ke.averageConfidence)}%`, [Ke.averageConfidence]), Jn = (C, R, $) => {
    const F = (C.code || C.title || `Suggestion ${$ + 1}`).toString(), ue = C.title || C.description || F, De = C.details || C.aiReasoning || C.description, Ye = Zs(C), qe = kt(C), Ae = ct(C.confidence), Fe = `${R}-${C.id ?? F}-${$}`;
    if (R === "low")
      return /* @__PURE__ */ s.jsx(
        Me,
        {
          className: "group hover:shadow-md transition-all duration-300 border border-slate-200 bg-white hover:bg-slate-50/50",
          children: /* @__PURE__ */ s.jsxs("div", { className: "p-6 h-full flex flex-col", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between gap-3 mb-4", children: [
              /* @__PURE__ */ s.jsx("span", { className: "font-bold text-slate-800 font-mono", children: F }),
              /* @__PURE__ */ s.jsx(Be, { className: `${vt(qe)} text-xs`, children: qe })
            ] }),
            /* @__PURE__ */ s.jsxs("div", { className: "flex-1 space-y-2 mb-4", children: [
              /* @__PURE__ */ s.jsx("h6", { className: "font-semibold text-slate-800", children: ue }),
              De && /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 leading-relaxed", children: De }),
              Ye && /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-500", children: Ye })
            ] }),
            /* @__PURE__ */ s.jsxs("div", { className: "flex gap-3 mt-auto", children: [
              /* @__PURE__ */ s.jsx(Q, { size: "sm", variant: "outline", className: "flex-1", type: "button", children: "Apply Code" }),
              /* @__PURE__ */ s.jsx(Q, { size: "sm", variant: "ghost", className: "flex-1", type: "button", children: "Dismiss" })
            ] }),
            Ae && /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-slate-500 mt-3 text-right", children: [
              "AI Confidence: ",
              Ae
            ] })
          ] })
        },
        Fe
      );
    const er = R === "high" ? "group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-white via-red-50/20 to-rose-50/30 shadow-lg shadow-red-500/5 hover:shadow-red-500/10" : $ % 2 === 0 ? "group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-white via-amber-50/20 to-yellow-50/30 shadow-md shadow-amber-500/5 hover:shadow-amber-500/10" : "group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-white via-orange-50/20 to-red-50/30 shadow-md shadow-orange-500/5 hover:shadow-orange-500/10", tn = R === "high" ? "w-12 h-12 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/25 group-hover:scale-105 transition-transform duration-200" : "w-10 h-10 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-md shadow-amber-500/25", sn = R === "high" ? "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white border-0 shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all duration-200" : qe === "CPT" ? "border-orange-300 text-orange-700 hover:bg-orange-50" : "border-amber-300 text-amber-700 hover:bg-amber-50";
    return /* @__PURE__ */ s.jsx(Me, { className: er, children: /* @__PURE__ */ s.jsx("div", { className: "p-6", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-4", children: [
      /* @__PURE__ */ s.jsx("div", { className: tn, children: /* @__PURE__ */ s.jsx(Jt, { size: R === "high" ? 16 : 14, className: "text-white" }) }),
      /* @__PURE__ */ s.jsxs("div", { className: "flex-1 space-y-3", children: [
        /* @__PURE__ */ s.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ s.jsx("span", { className: "font-bold text-lg text-slate-800 font-mono", children: F }),
              R === "high" && /* @__PURE__ */ s.jsx(Be, { className: "bg-gradient-to-r from-red-500 to-rose-600 text-white border-0 shadow-sm", children: "High Priority" })
            ] }),
            /* @__PURE__ */ s.jsx("h5", { className: "font-semibold text-slate-800", children: ue })
          ] }),
          /* @__PURE__ */ s.jsx(Be, { className: `${vt(qe)} whitespace-nowrap text-xs`, children: qe })
        ] }),
        De && /* @__PURE__ */ s.jsx("p", { className: "text-slate-600 leading-relaxed", children: De }),
        Ye && /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600 bg-white/70 px-3 py-2 rounded-lg border border-slate-200/60", children: Ye }),
        /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 pt-2", children: [
          /* @__PURE__ */ s.jsx(
            Q,
            {
              className: R === "high" ? sn : void 0,
              variant: R === "high" ? "default" : "outline",
              size: R === "high" ? "default" : "sm",
              type: "button",
              children: R === "high" ? "Apply Code" : qe === "CPT" ? "Order Test" : "Apply"
            }
          ),
          /* @__PURE__ */ s.jsx(Q, { variant: "outline", className: "border-slate-300 hover:bg-slate-50", size: R === "high" ? "default" : "sm", type: "button", children: "Dismiss" }),
          /* @__PURE__ */ s.jsx("div", { className: "flex-1" }),
          Ae && /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full", children: [
            "AI Confidence: ",
            Ae
          ] })
        ] })
      ] })
    ] }) }) }, Fe);
  }, ys = (C) => {
    const R = {
      high: {
        title: "High Priority Recommendations",
        badgeText: "Requires Review",
        badgeClass: "bg-red-50 text-red-700 border border-red-200",
        dotClass: "bg-gradient-to-r from-red-500 to-rose-600",
        lineClass: "bg-gradient-to-r from-red-200 to-transparent",
        gridClass: "grid gap-4",
        emptyText: "No high priority recommendations available."
      },
      medium: {
        title: "Worth Considering",
        badgeText: "Consider",
        badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
        dotClass: "bg-gradient-to-r from-amber-500 to-yellow-600",
        lineClass: "bg-gradient-to-r from-amber-200 to-transparent",
        gridClass: "grid gap-4 lg:grid-cols-2",
        emptyText: "No medium priority recommendations available."
      },
      low: {
        title: "Additional Opportunities",
        badgeText: "Optional",
        badgeClass: "bg-slate-50 text-slate-700 border border-slate-200",
        dotClass: "bg-gradient-to-r from-slate-400 to-slate-500",
        lineClass: "bg-gradient-to-r from-slate-200 to-transparent",
        gridClass: "grid gap-6 lg:grid-cols-2 max-w-4xl",
        emptyText: "No additional opportunities detected."
      }
    }, $ = se[C], F = R[C];
    return /* @__PURE__ */ s.jsxs("div", { className: "space-y-4", children: [
      /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 px-1", children: [
        /* @__PURE__ */ s.jsx("div", { className: `w-2 h-2 ${F.dotClass} rounded-full shadow-sm` }),
        /* @__PURE__ */ s.jsx("h4", { className: "font-semibold text-slate-800", children: F.title }),
        /* @__PURE__ */ s.jsx("div", { className: `flex-1 h-px ${F.lineClass}` }),
        /* @__PURE__ */ s.jsx(Be, { className: F.badgeClass, children: F.badgeText })
      ] }),
      /* @__PURE__ */ s.jsx("div", { className: F.gridClass, children: $.length > 0 ? $.map((ue, De) => Jn(ue, C, De)) : /* @__PURE__ */ s.jsx(Me, { className: "border border-dashed border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-500 shadow-none", children: F.emptyText }) })
    ] }, C);
  };
  return /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
    /* @__PURE__ */ s.jsxs("div", { className: "flex h-full w-full", children: [
      /* @__PURE__ */ s.jsx(
        D.div,
        {
          initial: { x: -20, opacity: 0 },
          animate: { x: 0, opacity: 1 },
          className: "flex-1 bg-white border-r border-slate-200/50 shadow-sm",
          children: /* @__PURE__ */ s.jsxs("div", { className: "h-full flex flex-col", children: [
            /* @__PURE__ */ s.jsx("div", { className: "bg-slate-50/80 border-b border-slate-200/60 p-4", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center", children: /* @__PURE__ */ s.jsx(ei, { size: 14, className: "text-slate-600" }) }),
                /* @__PURE__ */ s.jsxs("div", { children: [
                  /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Original Draft" }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600 mt-0.5", children: "Your initial medical note" })
                ] })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 px-3 py-2 bg-slate-100/60 rounded-lg border border-slate-200/60", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center", children: /* @__PURE__ */ s.jsx(wt, { size: 12, className: "text-white" }) }),
                  /* @__PURE__ */ s.jsxs("div", { className: "text-xs", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800", children: Ge }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-slate-600 flex items-center gap-2", children: /* @__PURE__ */ s.jsx("span", { children: Qe }) })
                  ] })
                ] }),
                /* @__PURE__ */ s.jsx(
                  Q,
                  {
                    variant: "ghost",
                    size: "sm",
                    onClick: () => {
                      console.log("Info button clicked!"), k(!0);
                    },
                    className: "h-8 w-8 p-0 hover:bg-slate-200 text-slate-600 hover:text-slate-800",
                    title: "View patient information and visit details",
                    children: /* @__PURE__ */ s.jsx(So, { size: 16 })
                  }
                )
              ] })
            ] }) }),
            /* @__PURE__ */ s.jsx("div", { className: "flex-1 p-4 bg-white min-h-0", children: /* @__PURE__ */ s.jsx(
              "textarea",
              {
                ref: re,
                value: g,
                onChange: B,
                className: "w-full h-full resize-none border-none outline-none bg-transparent text-sm leading-relaxed text-slate-900",
                placeholder: "Enter your original medical note here...",
                style: {
                  minHeight: "100%",
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif'
                }
              }
            ) }),
            /* @__PURE__ */ s.jsx("div", { className: "p-3 border-t border-slate-200/60 bg-slate-50/50", children: /* @__PURE__ */ s.jsxs("div", { className: "flex justify-between items-center text-xs text-slate-500", children: [
              /* @__PURE__ */ s.jsx("span", { children: "Original content" }),
              /* @__PURE__ */ s.jsxs("span", { children: [
                g.length,
                " characters"
              ] })
            ] }) })
          ] })
        }
      ),
      /* @__PURE__ */ s.jsx(
        D.div,
        {
          initial: { x: 20, opacity: 0 },
          animate: { x: 0, opacity: 1 },
          className: "flex-1",
          style: { background: oe.background },
          children: /* @__PURE__ */ s.jsxs("div", { className: "h-full flex flex-col", children: [
            /* @__PURE__ */ s.jsx("div", { className: `${oe.headerClass} border-b p-4`, children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ s.jsxs(
                  D.div,
                  {
                    className: "w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden",
                    animate: {
                      background: f === "enhanced" ? "linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6)" : "linear-gradient(135deg, #8b5cf6, #a855f7, #d946ef)",
                      boxShadow: f === "enhanced" ? "0 4px 20px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)" : "0 4px 20px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
                    },
                    whileHover: {
                      scale: 1.05,
                      boxShadow: f === "enhanced" ? "0 6px 25px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)" : "0 6px 25px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)"
                    },
                    transition: { duration: 0.3 },
                    children: [
                      /* @__PURE__ */ s.jsx(
                        D.div,
                        {
                          className: "absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent",
                          animate: {
                            x: ["-100%", "100%"]
                          },
                          transition: {
                            duration: 2,
                            repeat: 1 / 0,
                            repeatType: "loop",
                            ease: "linear"
                          }
                        }
                      ),
                      /* @__PURE__ */ s.jsx(
                        D.div,
                        {
                          animate: {
                            scale: [1, 1.05, 1]
                          },
                          transition: { duration: 0.4, type: "spring", stiffness: 200 },
                          children: f === "enhanced" ? /* @__PURE__ */ s.jsx(Cs, { size: 18, className: "text-white drop-shadow-sm" }) : /* @__PURE__ */ s.jsx(wt, { size: 18, className: "text-white drop-shadow-sm" })
                        }
                      )
                    ]
                  }
                ),
                /* @__PURE__ */ s.jsxs("div", { children: [
                  /* @__PURE__ */ s.jsx("h3", { className: `font-semibold ${oe.headerTextClass}`, children: f === "enhanced" ? "AI Enhanced Version" : "Patient Summary Version" }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-xs opacity-70 mt-0.5", children: f === "enhanced" ? "Professionally enhanced medical documentation" : "Patient-friendly summary format" })
                ] })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ s.jsx(
                  Q,
                  {
                    variant: "ghost",
                    size: "sm",
                    onClick: () => {
                      console.log("Planning Assistant button clicked!"), O(!0);
                    },
                    className: "h-8 w-8 p-0 hover:bg-blue-100 text-blue-600 hover:text-blue-800",
                    title: "AI Planning Assistant",
                    children: /* @__PURE__ */ s.jsx(Yt, { size: 16 })
                  }
                ),
                /* @__PURE__ */ s.jsx(
                  Q,
                  {
                    variant: "ghost",
                    size: "sm",
                    onClick: () => {
                      console.log("Patient Review button clicked!"), P(!0);
                    },
                    className: "h-8 w-8 p-0 hover:bg-violet-100 text-violet-600 hover:text-violet-800",
                    title: "Patient Review Panel",
                    children: /* @__PURE__ */ s.jsx(jt, { size: 16 })
                  }
                ),
                /* @__PURE__ */ s.jsxs(
                  D.button,
                  {
                    onClick: () => v(f === "enhanced" ? "summary" : "enhanced"),
                    className: `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${f === "enhanced" ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-violet-100 text-violet-700 hover:bg-violet-200"}`,
                    whileHover: { scale: 1.02 },
                    whileTap: { scale: 0.98 },
                    children: [
                      /* @__PURE__ */ s.jsx(
                        D.div,
                        {
                          animate: { rotate: f === "enhanced" ? 0 : 180 },
                          transition: { duration: 0.2 },
                          children: /* @__PURE__ */ s.jsx(ox, { size: 14 })
                        }
                      ),
                      "Switch to ",
                      f === "enhanced" ? "Summary" : "Enhanced"
                    ]
                  }
                )
              ] })
            ] }) }),
            /* @__PURE__ */ s.jsx(mt, { mode: "wait", children: /* @__PURE__ */ s.jsx(
              D.div,
              {
                initial: { opacity: 0, y: 10 },
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, y: -10 },
                transition: { duration: 0.2 },
                className: "flex-1 p-4 min-h-0",
                children: /* @__PURE__ */ s.jsx(
                  "textarea",
                  {
                    ref: w,
                    value: G(),
                    onChange: W,
                    className: "w-full h-full resize-none border-none outline-none bg-white/80 rounded-lg p-4 text-sm leading-relaxed shadow-sm text-slate-900",
                    placeholder: f === "enhanced" ? "AI-enhanced medical documentation will appear here..." : "Patient-friendly summary will appear here...",
                    style: {
                      minHeight: "100%",
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif'
                    }
                  }
                )
              },
              f
            ) }),
            /* @__PURE__ */ s.jsx("div", { className: `p-4 border-t ${oe.footerClass}`, children: /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex gap-3", children: [
                /* @__PURE__ */ s.jsxs(
                  Q,
                  {
                    onClick: ee,
                    className: `flex-1 font-medium transition-all ${Z ? "bg-emerald-600 hover:bg-orange-500 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`,
                    size: "sm",
                    children: [
                      /* @__PURE__ */ s.jsx(_e, { size: 14, className: "mr-2" }),
                      Z ? `${f === "enhanced" ? "Enhanced" : "Summary"} Accepted - Click to Unaccept` : `Accept ${f === "enhanced" ? "Enhanced" : "Summary"} Version`
                    ]
                  }
                ),
                /* @__PURE__ */ s.jsxs(
                  Q,
                  {
                    onClick: u,
                    variant: "outline",
                    size: "sm",
                    disabled: Z,
                    className: `px-4 ${f === "enhanced" ? "border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed" : "border-violet-300 text-violet-700 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed"}`,
                    children: [
                      /* @__PURE__ */ s.jsx(Z0, { size: 14, className: "mr-2" }),
                      "Re-beautify"
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "flex justify-between items-center text-xs opacity-70", children: [
                /* @__PURE__ */ s.jsx("span", { children: f === "enhanced" ? "Enhanced content" : "Summary content" }),
                /* @__PURE__ */ s.jsxs("span", { children: [
                  G().length,
                  " characters"
                ] })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between text-xs", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ s.jsx("div", { className: `w-2 h-2 rounded-full ${f === "enhanced" ? "bg-blue-500" : "bg-violet-500"}` }),
                  /* @__PURE__ */ s.jsxs("span", { className: "opacity-70", children: [
                    "Currently viewing: ",
                    f === "enhanced" ? "AI Enhanced" : "Patient Summary",
                    " version"
                  ] })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ s.jsxs("div", { className: `flex items-center gap-1 px-2 py-1 rounded-md text-xs ${T.enhanced ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`, children: [
                    /* @__PURE__ */ s.jsx(_e, { size: 10 }),
                    "Enhanced"
                  ] }),
                  /* @__PURE__ */ s.jsxs("div", { className: `flex items-center gap-1 px-2 py-1 rounded-md text-xs ${T.summary ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`, children: [
                    /* @__PURE__ */ s.jsx(_e, { size: 10 }),
                    "Summary"
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "flex justify-between items-center pt-2 border-t border-current/10", children: [
                /* @__PURE__ */ s.jsx(
                  Q,
                  {
                    variant: "outline",
                    size: "sm",
                    className: "text-xs",
                    onClick: h,
                    children: "← Back to Compose"
                  }
                ),
                /* @__PURE__ */ s.jsx(
                  Q,
                  {
                    size: "sm",
                    disabled: !we,
                    className: `text-xs transition-all ${we ? "bg-slate-700 hover:bg-slate-800 text-white" : "bg-slate-300 text-slate-500 cursor-not-allowed"}`,
                    onClick: () => {
                      we && m && m();
                    },
                    children: we ? "Continue to Billing →" : "Accept Both Versions to Continue"
                  }
                )
              ] })
            ] }) })
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ s.jsx(yn, { open: A, onOpenChange: k, children: /* @__PURE__ */ s.jsxs(Es, { className: "max-w-[95vw] w-[95vw] h-[90vh] p-0 flex flex-col border-2 border-slate-200/60 shadow-2xl shadow-slate-400/20 bg-white", children: [
      /* @__PURE__ */ s.jsx(jn, { className: "px-6 py-4 border-b-2 border-slate-200/60 bg-gradient-to-r from-slate-50 via-blue-50 to-indigo-50 flex-shrink-0", children: /* @__PURE__ */ s.jsxs(As, { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ s.jsx("div", { className: "w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg", children: /* @__PURE__ */ s.jsx(So, { size: 22, className: "text-white" }) }),
        /* @__PURE__ */ s.jsxs("div", { children: [
          /* @__PURE__ */ s.jsx("h2", { className: "text-xl font-semibold text-slate-800", children: "Patient Information & Visit Details" }),
          /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Comprehensive patient data and visit documentation" })
        ] })
      ] }) }),
      /* @__PURE__ */ s.jsxs(uv, { defaultValue: "patient-summary", className: "flex-1 flex flex-col min-h-0", children: [
        /* @__PURE__ */ s.jsx("div", { className: "px-6 py-3 border-b-2 border-slate-200/40 bg-gradient-to-r from-slate-50/80 via-blue-50/60 to-indigo-50/60 flex-shrink-0", children: /* @__PURE__ */ s.jsxs(mv, { className: "grid w-full grid-cols-4 bg-gradient-to-r from-white via-blue-50/30 to-indigo-50/30 shadow-md border border-slate-200/60 h-12", children: [
          /* @__PURE__ */ s.jsxs(wn, { value: "patient-summary", className: "flex items-center gap-2 px-3 text-sm", children: [
            /* @__PURE__ */ s.jsx(wt, { size: 14 }),
            /* @__PURE__ */ s.jsx("span", { className: "hidden sm:inline", children: "Patient" }),
            /* @__PURE__ */ s.jsx("span", { className: "sm:hidden", children: "Summary" })
          ] }),
          /* @__PURE__ */ s.jsxs(wn, { value: "transcript", className: "flex items-center gap-2 px-3 text-sm", children: [
            /* @__PURE__ */ s.jsx(Os, { size: 14 }),
            /* @__PURE__ */ s.jsx("span", { className: "hidden sm:inline", children: "Visit" }),
            /* @__PURE__ */ s.jsx("span", { className: "sm:hidden", children: "Transcript" })
          ] }),
          /* @__PURE__ */ s.jsxs(wn, { value: "codes", className: "flex items-center gap-2 px-3 text-sm", children: [
            /* @__PURE__ */ s.jsx(jt, { size: 14 }),
            /* @__PURE__ */ s.jsx("span", { className: "hidden sm:inline", children: "Codes" }),
            /* @__PURE__ */ s.jsx("span", { className: "sm:hidden", children: "Details" })
          ] }),
          /* @__PURE__ */ s.jsxs(wn, { value: "unused-suggestions", className: "flex items-center gap-2 px-3 text-sm", children: [
            /* @__PURE__ */ s.jsx(Yt, { size: 14 }),
            /* @__PURE__ */ s.jsx("span", { className: "hidden sm:inline", children: "Unused" }),
            /* @__PURE__ */ s.jsx("span", { className: "sm:hidden", children: "AI" })
          ] })
        ] }) }),
        /* @__PURE__ */ s.jsx("div", { className: "flex-1 min-h-0 overflow-hidden", children: /* @__PURE__ */ s.jsx(Ar, { className: "h-full", children: /* @__PURE__ */ s.jsxs("div", { className: "p-6", children: [
          /* @__PURE__ */ s.jsxs(Nn, { value: "patient-summary", className: "mt-0 space-y-6", children: [
            /* @__PURE__ */ s.jsx("div", { className: "bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 text-white p-6 rounded-xl shadow-lg border border-slate-200/40", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4", children: [
              /* @__PURE__ */ s.jsx("div", { className: "w-16 h-16 bg-white/20 rounded-full flex items-center justify-center", children: /* @__PURE__ */ s.jsx(wt, { size: 28, className: "text-white" }) }),
              /* @__PURE__ */ s.jsxs("div", { children: [
                /* @__PURE__ */ s.jsx("h1", { className: "text-2xl font-semibold", children: Ge }),
                /* @__PURE__ */ s.jsx("p", { className: "text-blue-100", children: Qe })
              ] })
            ] }) }),
            /* @__PURE__ */ s.jsxs(Me, { className: "p-6 border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/60 via-green-50/40 to-white shadow-sm border border-slate-200/50", children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(un, { size: 16, className: "text-emerald-600" }) }),
                /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Visit Snapshot" })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "text-center p-3 bg-blue-50 rounded-lg border border-blue-200", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "text-xl font-bold text-blue-800", children: I.length }),
                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-blue-600 mt-1", children: "Codes Reviewed" }),
                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-blue-500", children: "Selected" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "text-center p-3 bg-green-50 rounded-lg border border-green-200", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-green-800", children: se.high.length + se.medium.length + se.low.length }),
                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-green-600 mt-1", children: "AI Suggestions" }),
                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-green-500", children: "Unused" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "text-center p-3 bg-indigo-50 rounded-lg border border-indigo-200", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-indigo-800", children: K.formattedTotal }),
                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-600 mt-1", children: "Estimated Reimbursement" }),
                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-500", children: "USD" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "text-center p-3 bg-purple-50 rounded-lg border border-purple-200", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-purple-800", children: ae }),
                  /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-600 mt-1", children: "Primary Focus" }),
                  /* @__PURE__ */ s.jsxs("div", { className: "text-xs text-purple-500", children: [
                    "Provider: ",
                    tt
                  ] })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ s.jsxs(Me, { className: "p-6 border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50/60 via-yellow-50/40 to-white shadow-sm border border-slate-200/50", children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-gradient-to-br from-amber-100 to-yellow-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(Jt, { size: 16, className: "text-amber-600" }) }),
                /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Allergies & Reactions" })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "p-4 bg-amber-50 rounded-lg border border-amber-200", children: [
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-2", children: [
                    /* @__PURE__ */ s.jsx(Be, { variant: "secondary", className: "bg-red-100 text-red-800 flex-shrink-0 text-xs px-2 py-1", children: "HIGH ALERT" }),
                    /* @__PURE__ */ s.jsx("p", { className: "font-medium text-sm text-slate-800", children: "Penicillin" })
                  ] }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600 ml-0", children: "Severe rash, documented 2019" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "p-4 bg-amber-50 rounded-lg border border-amber-200", children: [
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-2", children: [
                    /* @__PURE__ */ s.jsx(Be, { variant: "secondary", className: "bg-orange-100 text-orange-800 flex-shrink-0 text-xs px-2 py-1", children: "MODERATE" }),
                    /* @__PURE__ */ s.jsx("p", { className: "font-medium text-sm text-slate-800", children: "Shellfish" })
                  ] }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600 ml-0", children: "Gastrointestinal upset" })
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ s.jsx(Nn, { value: "transcript", className: "mt-0 space-y-6", children: /* @__PURE__ */ s.jsxs(Me, { className: "p-6 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-white shadow-sm border border-slate-200/50", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
              /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(Os, { size: 16, className: "text-blue-600" }) }),
              /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Visit Transcript" }),
              /* @__PURE__ */ s.jsx(Be, { className: "bg-blue-100 text-blue-800 text-xs", children: `${Dt.length} entries captured` })
            ] }),
            /* @__PURE__ */ s.jsx("div", { className: "space-y-3", children: Dt.length ? Dt.map((C) => {
              const R = C.isProvider, $ = R ? "bg-white p-4 rounded-lg border border-slate-200" : "bg-blue-50 p-4 rounded-lg border border-blue-200", F = R ? "w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" : "w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", ue = R ? /* @__PURE__ */ s.jsx(un, { size: 12, className: "text-blue-600" }) : /* @__PURE__ */ s.jsx(wt, { size: 12, className: "text-white" });
              return /* @__PURE__ */ s.jsx("div", { className: $, children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: F, children: ue }),
                /* @__PURE__ */ s.jsxs("div", { className: "flex-1 space-y-1", children: [
                  /* @__PURE__ */ s.jsxs("div", { className: `text-xs ${R ? "text-slate-500" : "text-blue-600"} flex items-center gap-2`, children: [
                    /* @__PURE__ */ s.jsx("span", { children: C.timestamp ? `${C.timestamp} • ${C.speaker}` : C.speaker }),
                    C.confidence !== null && /* @__PURE__ */ s.jsxs(Be, { variant: "outline", className: "text-[10px] px-1.5 py-0", children: [
                      "Confidence ",
                      C.confidence,
                      "%"
                    ] })
                  ] }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-700", children: C.text })
                ] })
              ] }) }, C.id);
            }) : /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200 text-sm text-slate-600", children: "No transcript entries captured during this visit." }) })
          ] }) }),
          /* @__PURE__ */ s.jsxs(Nn, { value: "codes", className: "mt-0 space-y-6", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [
              /* @__PURE__ */ s.jsxs(Me, { className: "p-6 border-l-4 border-l-green-500 bg-gradient-to-r from-green-50/60 via-emerald-50/40 to-white shadow-sm border border-slate-200/50", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(_e, { size: 16, className: "text-green-600" }) }),
                  /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Applied ICD-10 Codes" }),
                  /* @__PURE__ */ s.jsx(Be, { className: "bg-green-100 text-green-800 text-xs", children: "Billable" })
                ] }),
                /* @__PURE__ */ s.jsx("div", { className: "space-y-3", children: he.length > 0 ? he.map((C, R) => vs(C, R)) : /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-dashed border-slate-200 text-sm text-slate-600 text-center", children: "No ICD-10 codes have been applied yet." }) })
              ] }),
              /* @__PURE__ */ s.jsxs(Me, { className: "p-6 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-white shadow-sm border border-slate-200/50", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(jt, { size: 16, className: "text-blue-600" }) }),
                  /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Applied CPT Codes" }),
                  /* @__PURE__ */ s.jsx(Be, { className: "bg-blue-100 text-blue-800 text-xs", children: "Billable" })
                ] }),
                /* @__PURE__ */ s.jsx("div", { className: "space-y-3", children: Se.length > 0 ? Se.map((C, R) => vs(C, R)) : /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-dashed border-slate-200 text-sm text-slate-600 text-center", children: "No CPT codes have been applied yet." }) })
              ] })
            ] }),
            /* @__PURE__ */ s.jsxs(Me, { className: "p-6 border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/60 via-green-50/40 to-white shadow-sm border border-slate-200/50", children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(Jt, { size: 16, className: "text-emerald-600" }) }),
                /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Billing Summary" })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-4 rounded-lg border border-slate-200 text-center", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-emerald-700", children: I.length }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Total Codes Applied" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-4 rounded-lg border border-slate-200 text-center", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-blue-700", children: K.formattedTotal }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Estimated Charges" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-4 rounded-lg border border-slate-200 text-center", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-purple-700", children: ae }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mt-1", children: Te })
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ s.jsxs(Nn, { value: "unused-suggestions", className: "mt-0 space-y-6", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "space-y-8", children: [
              /* @__PURE__ */ s.jsx("div", { className: "text-center space-y-3", children: /* @__PURE__ */ s.jsxs("div", { className: "inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-slate-50 via-blue-50/50 to-purple-50/30 border border-slate-200/60 rounded-2xl shadow-sm", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-10 h-10 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20", children: /* @__PURE__ */ s.jsx(Yt, { size: 18, className: "text-white" }) }),
                /* @__PURE__ */ s.jsxs("div", { className: "text-left", children: [
                  /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "AI-Suggested Unused Codes" }),
                  /* @__PURE__ */ s.jsxs("p", { className: "text-xs text-slate-600", children: [
                    "Additional opportunities identified by clinical AI • ",
                    Ke.total,
                    " ",
                    Ke.total === 1 ? "suggestion" : "suggestions",
                    " pending review"
                  ] })
                ] }),
                /* @__PURE__ */ s.jsx(Be, { className: "bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 shadow-lg shadow-blue-500/25 px-3 py-1", children: "AI Insights" })
              ] }) }),
              ys("high"),
              ys("medium"),
              ys("low"),
              /* @__PURE__ */ s.jsx("div", { className: "text-center pt-4 border-t border-slate-200", children: /* @__PURE__ */ s.jsxs("p", { className: "text-sm text-slate-600", children: [
                "Total unused opportunities: ",
                /* @__PURE__ */ s.jsx("span", { className: "font-semibold text-slate-800", children: Ke.total }),
                " ",
                Ke.total === 1 ? "code" : "codes",
                " • Potential additional revenue:",
                " ",
                /* @__PURE__ */ s.jsx("span", { className: "font-semibold text-emerald-700", children: Js }),
                en !== "—" && /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                  " ",
                  "• Average confidence:",
                  " ",
                  /* @__PURE__ */ s.jsx("span", { className: "font-semibold text-blue-700", children: en })
                ] })
              ] }) })
            ] }),
            /* @__PURE__ */ s.jsxs(Me, { className: "p-6 border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50/60 via-violet-50/40 to-white shadow-sm border border-slate-200/50", children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-gradient-to-br from-purple-100 to-violet-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(Cs, { size: 16, className: "text-purple-600" }) }),
                /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Unused Codes Summary" })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-4 rounded-lg border border-slate-200 text-center", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-amber-700", children: Ke.total }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Total Unused Codes" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-4 rounded-lg border border-slate-200 text-center", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-orange-700", children: Js }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Potential Additional Revenue" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-4 rounded-lg border border-slate-200 text-center", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-purple-700", children: Ke.high }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mt-1", children: "High Priority Suggestions" })
                ] })
              ] })
            ] })
          ] })
        ] }) }) })
      ] })
    ] }) }),
    /* @__PURE__ */ s.jsx(yn, { open: L, onOpenChange: O, children: /* @__PURE__ */ s.jsxs(Es, { className: "max-w-5xl h-[90vh] p-0 flex flex-col border-2 border-slate-200/60 shadow-2xl shadow-slate-400/20 bg-white", children: [
      /* @__PURE__ */ s.jsx(jn, { className: "px-6 py-4 border-b-2 border-slate-200/60 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 flex-shrink-0", children: /* @__PURE__ */ s.jsxs(As, { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ s.jsx("div", { className: "w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg", children: /* @__PURE__ */ s.jsx(Yt, { size: 22, className: "text-white" }) }),
        /* @__PURE__ */ s.jsxs("div", { children: [
          /* @__PURE__ */ s.jsx("h2", { className: "text-xl font-semibold text-slate-800", children: "AI Planning Assistant" }),
          /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Intelligent care planning with comprehensive recommendations" })
        ] })
      ] }) }),
      /* @__PURE__ */ s.jsx("div", { className: "flex-1 min-h-0 overflow-hidden", children: /* @__PURE__ */ s.jsx(Ar, { className: "h-full", children: /* @__PURE__ */ s.jsxs("div", { className: "p-6 space-y-6", children: [
        /* @__PURE__ */ s.jsx("div", { className: "bg-gradient-to-r from-yellow-50 via-amber-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-4 shadow-sm", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ s.jsx("div", { className: "w-12 h-12 bg-gradient-to-br from-yellow-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg", children: /* @__PURE__ */ s.jsx(jt, { size: 20, className: "text-white" }) }),
            /* @__PURE__ */ s.jsxs("div", { children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-3 h-3 bg-yellow-500 rounded-full animate-pulse" }),
                /* @__PURE__ */ s.jsx("span", { className: "font-semibold text-yellow-900", children: "MODERATE RISK PATIENT" })
              ] }),
              /* @__PURE__ */ s.jsx("p", { className: "text-sm text-yellow-800", children: "Chest pain presentation + diabetes/hypertension comorbidities" })
            ] })
          ] }),
          /* @__PURE__ */ s.jsxs("div", { className: "ml-auto text-right", children: [
            /* @__PURE__ */ s.jsx("div", { className: "text-xs text-yellow-700 font-medium", children: "Risk Factors:" }),
            /* @__PURE__ */ s.jsx("div", { className: "text-xs text-yellow-600", children: "• Cardiac symptoms • DM/HTN • Age 49" })
          ] })
        ] }) }),
        /* @__PURE__ */ s.jsxs(Me, { className: "p-6 border-l-4 border-l-slate-500 bg-gradient-to-r from-slate-50/60 via-gray-50/40 to-white shadow-sm border border-slate-200/50", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
            /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-gradient-to-br from-slate-100 to-gray-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(Os, { size: 16, className: "text-slate-600" }) }),
            /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Current Plan from Note" })
          ] }),
          /* @__PURE__ */ s.jsx("div", { className: "bg-slate-50 rounded-lg p-4 border border-slate-200", children: /* @__PURE__ */ s.jsxs("div", { className: "space-y-3 text-sm text-slate-700", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-2", children: [
              /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-slate-400 rounded-full mt-2 flex-shrink-0" }),
              /* @__PURE__ */ s.jsx("span", { children: "Follow-up appointment in 2 weeks" })
            ] }),
            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-2", children: [
              /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-slate-400 rounded-full mt-2 flex-shrink-0" }),
              /* @__PURE__ */ s.jsx("span", { children: "Lab work - CBC and comprehensive metabolic panel" })
            ] }),
            /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-2", children: [
              /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-slate-400 rounded-full mt-2 flex-shrink-0" }),
              /* @__PURE__ */ s.jsx("span", { children: "Patient education on medication compliance" })
            ] })
          ] }) })
        ] }),
        /* @__PURE__ */ s.jsxs(Me, { className: "p-6 border-l-4 border-l-indigo-500 bg-gradient-to-r from-indigo-50/60 via-blue-50/40 to-white shadow-sm border border-slate-200/50", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-6", children: [
            /* @__PURE__ */ s.jsx("div", { className: "w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg", children: /* @__PURE__ */ s.jsx(Cs, { size: 18, className: "text-white" }) }),
            /* @__PURE__ */ s.jsxs("div", { children: [
              /* @__PURE__ */ s.jsx("h3", { className: "text-lg font-semibold text-slate-800", children: "AI Clinical Recommendations" }),
              /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Evidence-based suggestions for optimal patient care" })
            ] })
          ] }),
          /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2 mb-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-6 h-6 bg-red-100 rounded-lg flex items-center justify-center", children: /* @__PURE__ */ s.jsx(Jt, { size: 12, className: "text-red-600" }) }),
                /* @__PURE__ */ s.jsx("h4", { className: "font-semibold text-slate-800", children: "Immediate Diagnostic Workup" })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200 shadow-sm", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800 text-sm", children: "12-Lead ECG + Cardiac Enzymes" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600 mt-1", children: "Rule out acute coronary syndrome, obtain troponin I/T, CK-MB" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-red-600 mt-1 font-medium", children: "Priority: STAT" })
                  ] })
                ] }) }),
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200 shadow-sm", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800 text-sm", children: "Chest X-ray PA & Lateral" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600 mt-1", children: "Evaluate for pulmonary edema, pneumothorax, or other thoracic pathology" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-orange-600 mt-1 font-medium", children: "Priority: Urgent" })
                  ] })
                ] }) }),
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200 shadow-sm", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800 text-sm", children: "Enhanced Laboratory Panel" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600 mt-1", children: "Add lipid panel, HbA1c, BNP/NT-proBNP, D-dimer" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-blue-600 mt-1 font-medium", children: "Priority: Today" })
                  ] })
                ] }) })
              ] })
            ] }),
            /* @__PURE__ */ s.jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2 mb-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center", children: /* @__PURE__ */ s.jsx(Cs, { size: 12, className: "text-green-600" }) }),
                /* @__PURE__ */ s.jsx("h4", { className: "font-semibold text-slate-800", children: "Specialist Consultation & Follow-up" })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200 shadow-sm", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800 text-sm", children: "Cardiology Consultation" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600 mt-1", children: "Schedule within 1-2 weeks for specialist evaluation and risk stratification" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-green-600 mt-1 font-medium", children: "Timeline: 1-2 weeks" })
                  ] })
                ] }) }),
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200 shadow-sm", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800 text-sm", children: "Accelerated Follow-up" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600 mt-1", children: "Consider 1-week follow-up instead of 2 weeks given symptom severity" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-purple-600 mt-1 font-medium", children: "Recommended: 1 week" })
                  ] })
                ] }) }),
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200 shadow-sm", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800 text-sm", children: "Enhanced Patient Education" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600 mt-1", children: "Provide chest pain warning signs, when to seek emergency care" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-indigo-600 mt-1 font-medium", children: "Include: Emergency protocols" })
                  ] })
                ] }) })
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ s.jsxs(Me, { className: "p-6 border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50/60 via-violet-50/40 to-white shadow-sm border border-slate-200/50", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
            /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 bg-gradient-to-br from-purple-100 to-violet-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(_e, { size: 16, className: "text-purple-600" }) }),
            /* @__PURE__ */ s.jsx("h3", { className: "font-semibold text-slate-800", children: "Complete Action Plan Checklist" }),
            /* @__PURE__ */ s.jsxs(Be, { variant: "secondary", className: "bg-purple-100 text-purple-800 text-xs", children: [
              be.filter((C) => C.checked).length,
              " of ",
              be.length,
              " completed"
            ] })
          ] }),
          /* @__PURE__ */ s.jsx("div", { className: "space-y-3", children: be.map((C) => /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors", children: [
            /* @__PURE__ */ s.jsx(
              Ov,
              {
                checked: C.checked,
                onCheckedChange: () => le(C.id),
                className: "flex-shrink-0"
              }
            ),
            /* @__PURE__ */ s.jsx("span", { className: `text-sm flex-1 ${C.checked ? "line-through text-slate-500" : "text-slate-800"}`, children: C.text }),
            C.checked && /* @__PURE__ */ s.jsx("div", { className: "text-green-600", children: /* @__PURE__ */ s.jsx(_e, { size: 16 }) })
          ] }, C.id)) }),
          /* @__PURE__ */ s.jsxs("div", { className: "mt-4 flex gap-2", children: [
            /* @__PURE__ */ s.jsx(
              Vv,
              {
                placeholder: "Add a custom action item...",
                value: pe,
                onChange: (C) => de(C.target.value),
                className: "flex-1",
                rows: 2
              }
            ),
            /* @__PURE__ */ s.jsxs(Q, { onClick: Le, size: "sm", className: "self-end bg-purple-600 hover:bg-purple-700", children: [
              /* @__PURE__ */ s.jsx(Jt, { size: 14, className: "mr-1" }),
              "Add Step"
            ] })
          ] })
        ] })
      ] }) }) })
    ] }) }),
    /* @__PURE__ */ s.jsx(yn, { open: q, onOpenChange: P, children: /* @__PURE__ */ s.jsxs(Es, { className: "max-w-[98vw] w-[98vw] h-[95vh] p-0 flex flex-col border-2 border-slate-200/60 shadow-2xl shadow-slate-400/20 bg-white", children: [
      /* @__PURE__ */ s.jsx(jn, { className: "px-8 py-6 border-b-2 border-slate-200/60 bg-gradient-to-r from-violet-50 via-purple-50 to-pink-50 flex-shrink-0", children: /* @__PURE__ */ s.jsxs(As, { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ s.jsx("div", { className: "w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg", children: /* @__PURE__ */ s.jsx(jt, { size: 24, className: "text-white" }) }),
        /* @__PURE__ */ s.jsxs("div", { children: [
          /* @__PURE__ */ s.jsx("h2", { className: "text-2xl font-semibold text-slate-800", children: "Patient Care Summary" }),
          /* @__PURE__ */ s.jsx("p", { className: "text-base text-slate-600 mt-1", children: "Your visit overview - what we found and what's next" })
        ] })
      ] }) }),
      /* @__PURE__ */ s.jsx("div", { className: "flex-1 min-h-0 overflow-hidden", children: /* @__PURE__ */ s.jsx(Ar, { className: "h-full", children: /* @__PURE__ */ s.jsxs("div", { className: "p-8 space-y-8", children: [
        /* @__PURE__ */ s.jsx("div", { className: "bg-gradient-to-r from-violet-500 via-purple-600 to-indigo-600 text-white p-8 rounded-xl shadow-lg", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-6", children: [
          /* @__PURE__ */ s.jsx("div", { className: "w-20 h-20 bg-white/20 rounded-full flex items-center justify-center", children: /* @__PURE__ */ s.jsx(wt, { size: 32, className: "text-white" }) }),
          /* @__PURE__ */ s.jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ s.jsx("h1", { className: "text-3xl font-semibold mb-2", children: "Hello Mr. Smith!" }),
            /* @__PURE__ */ s.jsx("p", { className: "text-lg text-violet-100 mb-1", children: "Here's what happened during your visit today" }),
            /* @__PURE__ */ s.jsx("p", { className: "text-violet-200", children: "March 15, 2024 • 45-minute appointment • Dr. Johnson" })
          ] }),
          /* @__PURE__ */ s.jsxs("div", { className: "text-right bg-white/10 p-4 rounded-lg", children: [
            /* @__PURE__ */ s.jsx("div", { className: "text-sm font-medium text-violet-200", children: "Your Health Status" }),
            /* @__PURE__ */ s.jsx("div", { className: "text-3xl font-bold text-white", children: "Good" }),
            /* @__PURE__ */ s.jsx("div", { className: "text-sm text-violet-200", children: "Monitoring needed" })
          ] })
        ] }) }),
        /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [
          /* @__PURE__ */ s.jsxs(Me, { className: "p-8 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-white shadow-sm border border-slate-200/50", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4 mb-6", children: [
              /* @__PURE__ */ s.jsx("div", { className: "w-10 h-10 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(un, { size: 20, className: "text-blue-600" }) }),
              /* @__PURE__ */ s.jsx("h3", { className: "text-xl font-semibold text-slate-800", children: "What We Found" })
            ] }),
            /* @__PURE__ */ s.jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: [
                /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800 mb-2", children: "Your main concern:" }),
                /* @__PURE__ */ s.jsx("p", { className: "text-slate-700", children: "Chest pain and shortness of breath for the past 3 days" })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: [
                /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800 mb-2", children: "What this could be:" }),
                /* @__PURE__ */ s.jsx("p", { className: "text-slate-700", children: "We're checking if this is related to your heart, given your diabetes and blood pressure history" })
              ] }),
              /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: [
                /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800 mb-2", children: "Risk level:" }),
                /* @__PURE__ */ s.jsx("p", { className: "text-slate-700", children: "Moderate - we want to be thorough and make sure everything is okay" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ s.jsxs(Me, { className: "p-8 border-l-4 border-l-green-500 bg-gradient-to-r from-green-50/60 via-emerald-50/40 to-white shadow-sm border border-slate-200/50", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4 mb-6", children: [
              /* @__PURE__ */ s.jsx("div", { className: "w-10 h-10 bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(_e, { size: 20, className: "text-green-600" }) }),
              /* @__PURE__ */ s.jsx("h3", { className: "text-xl font-semibold text-slate-800", children: "Tests We're Doing" })
            ] }),
            /* @__PURE__ */ s.jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-3 h-3 bg-green-500 rounded-full" }),
                /* @__PURE__ */ s.jsxs("div", { children: [
                  /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800", children: "Heart tracing (ECG)" }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "To check your heart rhythm and activity" })
                ] })
              ] }) }),
              /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-3 h-3 bg-green-500 rounded-full" }),
                /* @__PURE__ */ s.jsxs("div", { children: [
                  /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800", children: "Blood tests" }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "To check for heart damage and general health" })
                ] })
              ] }) }),
              /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: "w-3 h-3 bg-green-500 rounded-full" }),
                /* @__PURE__ */ s.jsxs("div", { children: [
                  /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800", children: "Chest X-ray" }),
                  /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "To look at your lungs and heart" })
                ] })
              ] }) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ s.jsxs(Me, { className: "p-8 border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50/60 via-violet-50/40 to-white shadow-sm border border-slate-200/50", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4 mb-6", children: [
            /* @__PURE__ */ s.jsx("div", { className: "w-10 h-10 bg-gradient-to-br from-purple-100 to-violet-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(Yt, { size: 20, className: "text-purple-600" }) }),
            /* @__PURE__ */ s.jsx("h3", { className: "text-xl font-semibold text-slate-800", children: "Your Care Plan - What Happens Next" })
          ] }),
          /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [
            /* @__PURE__ */ s.jsx("div", { className: "space-y-6", children: /* @__PURE__ */ s.jsxs("div", { children: [
              /* @__PURE__ */ s.jsx("h4", { className: "font-medium text-lg text-slate-800 mb-4", children: "This Week" }),
              /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-4 h-4 bg-blue-500 rounded-full flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800", children: "Get your test results" }),
                    /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "We'll call you within 1-2 days with results" })
                  ] })
                ] }) }),
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-4 h-4 bg-green-500 rounded-full flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800", children: "See a heart specialist" }),
                    /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "Cardiology appointment within 1-2 weeks" })
                  ] })
                ] }) }),
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-4 h-4 bg-purple-500 rounded-full flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800", children: "Follow-up with me" }),
                    /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "Return visit in 1 week to review everything" })
                  ] })
                ] }) })
              ] })
            ] }) }),
            /* @__PURE__ */ s.jsx("div", { className: "space-y-6", children: /* @__PURE__ */ s.jsxs("div", { children: [
              /* @__PURE__ */ s.jsx("h4", { className: "font-medium text-lg text-slate-800 mb-4", children: "Keep Taking Care of Yourself" }),
              /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-4 h-4 bg-emerald-500 rounded-full flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800", children: "Continue your medications" }),
                    /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "Keep taking metformin and lisinopril as usual" })
                  ] })
                ] }) }),
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-4 h-4 bg-orange-500 rounded-full flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800", children: "Watch for warning signs" }),
                    /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "Call 911 if chest pain gets worse or spreads to your jaw/back" })
                  ] })
                ] }) }),
                /* @__PURE__ */ s.jsx("div", { className: "bg-white p-4 rounded-lg border border-slate-200", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-4 h-4 bg-indigo-500 rounded-full flex-shrink-0" }),
                  /* @__PURE__ */ s.jsxs("div", { children: [
                    /* @__PURE__ */ s.jsx("div", { className: "font-medium text-slate-800", children: "Take it easy" }),
                    /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "Avoid heavy exercise until we know more" })
                  ] })
                ] }) })
              ] })
            ] }) })
          ] })
        ] }),
        /* @__PURE__ */ s.jsxs(Me, { className: "p-8 border-l-4 border-l-red-500 bg-gradient-to-r from-red-50/60 via-rose-50/40 to-white shadow-sm border border-slate-200/50", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4 mb-6", children: [
            /* @__PURE__ */ s.jsx("div", { className: "w-10 h-10 bg-gradient-to-br from-red-100 to-rose-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(jt, { size: 20, className: "text-red-600" }) }),
            /* @__PURE__ */ s.jsx("h3", { className: "text-xl font-semibold text-slate-800", children: "Important - When to Call for Help" })
          ] }),
          /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [
            /* @__PURE__ */ s.jsx("div", { className: "space-y-4", children: /* @__PURE__ */ s.jsx("div", { className: "bg-red-100 p-6 rounded-lg border border-red-200", children: /* @__PURE__ */ s.jsxs("div", { className: "text-center", children: [
              /* @__PURE__ */ s.jsx("div", { className: "text-3xl font-bold text-red-800 mb-2", children: "Call 911" }),
              /* @__PURE__ */ s.jsx("div", { className: "font-medium text-red-800 mb-3", children: "If you have:" }),
              /* @__PURE__ */ s.jsxs("div", { className: "space-y-2 text-left", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-red-600 rounded-full" }),
                  /* @__PURE__ */ s.jsx("span", { className: "text-red-800", children: "Severe chest pain that won't go away" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-red-600 rounded-full" }),
                  /* @__PURE__ */ s.jsx("span", { className: "text-red-800", children: "Pain spreading to jaw, neck, or back" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-red-600 rounded-full" }),
                  /* @__PURE__ */ s.jsx("span", { className: "text-red-800", children: "Severe shortness of breath" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-red-600 rounded-full" }),
                  /* @__PURE__ */ s.jsx("span", { className: "text-red-800", children: "Nausea with chest pain" })
                ] })
              ] })
            ] }) }) }),
            /* @__PURE__ */ s.jsx("div", { className: "space-y-4", children: /* @__PURE__ */ s.jsx("div", { className: "bg-blue-100 p-6 rounded-lg border border-blue-200", children: /* @__PURE__ */ s.jsxs("div", { className: "text-center", children: [
              /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-blue-800 mb-2", children: "Call Our Office" }),
              /* @__PURE__ */ s.jsx("div", { className: "text-xl font-bold text-blue-800 mb-3", children: "(555) 123-4567" }),
              /* @__PURE__ */ s.jsx("div", { className: "font-medium text-blue-800 mb-3", children: "If you have questions or concerns about:" }),
              /* @__PURE__ */ s.jsxs("div", { className: "space-y-2 text-left", children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-blue-600 rounded-full" }),
                  /* @__PURE__ */ s.jsx("span", { className: "text-blue-800", children: "Your test results" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-blue-600 rounded-full" }),
                  /* @__PURE__ */ s.jsx("span", { className: "text-blue-800", children: "Your medications" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-blue-600 rounded-full" }),
                  /* @__PURE__ */ s.jsx("span", { className: "text-blue-800", children: "Appointment scheduling" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-blue-600 rounded-full" }),
                  /* @__PURE__ */ s.jsx("span", { className: "text-blue-800", children: "Any other questions" })
                ] })
              ] })
            ] }) }) })
          ] })
        ] }),
        /* @__PURE__ */ s.jsxs(Me, { className: "p-8 border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/60 via-green-50/40 to-white shadow-sm border border-slate-200/50", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4 mb-6", children: [
            /* @__PURE__ */ s.jsx("div", { className: "w-10 h-10 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg flex items-center justify-center shadow-sm", children: /* @__PURE__ */ s.jsx(_e, { size: 20, className: "text-emerald-600" }) }),
            /* @__PURE__ */ s.jsx("h3", { className: "text-xl font-semibold text-slate-800", children: "Your Health Team" })
          ] }),
          /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
            /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-6 rounded-lg border border-slate-200 text-center", children: [
              /* @__PURE__ */ s.jsx("div", { className: "w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4", children: /* @__PURE__ */ s.jsx(wt, { size: 24, className: "text-blue-600" }) }),
              /* @__PURE__ */ s.jsx("div", { className: "font-semibold text-slate-800 mb-1", children: "Dr. Johnson" }),
              /* @__PURE__ */ s.jsx("div", { className: "text-sm text-slate-600 mb-2", children: "Your Primary Care Doctor" }),
              /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500", children: "(555) 123-4567" })
            ] }),
            /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-6 rounded-lg border border-slate-200 text-center", children: [
              /* @__PURE__ */ s.jsx("div", { className: "w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4", children: /* @__PURE__ */ s.jsx(un, { size: 24, className: "text-red-600" }) }),
              /* @__PURE__ */ s.jsx("div", { className: "font-semibold text-slate-800 mb-1", children: "Dr. Rodriguez" }),
              /* @__PURE__ */ s.jsx("div", { className: "text-sm text-slate-600 mb-2", children: "Heart Specialist (Cardiologist)" }),
              /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500", children: "Appointment scheduled" })
            ] }),
            /* @__PURE__ */ s.jsxs("div", { className: "bg-white p-6 rounded-lg border border-slate-200 text-center", children: [
              /* @__PURE__ */ s.jsx("div", { className: "w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4", children: /* @__PURE__ */ s.jsx(Yt, { size: 24, className: "text-purple-600" }) }),
              /* @__PURE__ */ s.jsx("div", { className: "font-semibold text-slate-800 mb-1", children: "Sarah Wilson, RN" }),
              /* @__PURE__ */ s.jsx("div", { className: "text-sm text-slate-600 mb-2", children: "Care Coordinator" }),
              /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-500", children: "(555) 123-4568" })
            ] })
          ] })
        ] })
      ] }) }) })
    ] }) }),
    /* @__PURE__ */ s.jsx(yn, { open: q, onOpenChange: P, children: /* @__PURE__ */ s.jsxs(Es, { className: "max-w-[96vw] w-[96vw] max-h-[96vh] h-[96vh] p-0 flex flex-col border-0 shadow-2xl bg-gradient-to-br from-slate-50 via-white to-violet-50/30 overflow-hidden", children: [
      /* @__PURE__ */ s.jsxs(jn, { className: "sr-only", children: [
        /* @__PURE__ */ s.jsx(As, { children: "Neural Patient Analysis Dashboard" }),
        /* @__PURE__ */ s.jsx(Ed, { children: "AI-powered clinical intelligence dashboard displaying comprehensive patient data, predictive insights, and real-time health monitoring for enhanced medical decision making." })
      ] }),
      /* @__PURE__ */ s.jsxs("div", { className: "relative px-12 py-8 bg-gradient-to-r from-violet-600/10 via-purple-600/5 to-pink-600/10 backdrop-blur-xl border-b border-white/20", children: [
        /* @__PURE__ */ s.jsx("div", { className: "absolute inset-0 bg-gradient-to-r from-violet-500/5 via-purple-500/5 to-pink-500/5 backdrop-blur-sm" }),
        /* @__PURE__ */ s.jsxs("div", { className: "relative flex items-center justify-between", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4", children: [
            /* @__PURE__ */ s.jsx(
              D.div,
              {
                className: "w-14 h-14 rounded-2xl flex items-center justify-center relative overflow-hidden",
                style: {
                  background: "linear-gradient(135deg, #8b5cf6, #a855f7, #d946ef)",
                  boxShadow: "0 8px 32px rgba(139, 92, 246, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.2)"
                },
                whileHover: { scale: 1.05, rotate: 5 },
                transition: { type: "spring", stiffness: 400 },
                children: /* @__PURE__ */ s.jsx(
                  D.div,
                  {
                    animate: {
                      scale: [1, 1.1, 1],
                      rotate: [0, 10, 0]
                    },
                    transition: { duration: 4, repeat: 1 / 0, ease: "easeInOut" },
                    children: /* @__PURE__ */ s.jsx(jt, { size: 24, className: "text-white drop-shadow-lg" })
                  }
                )
              }
            ),
            /* @__PURE__ */ s.jsxs("div", { children: [
              /* @__PURE__ */ s.jsx("h2", { className: "text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent", children: "Neural Patient Analysis" }),
              /* @__PURE__ */ s.jsx("p", { className: "text-slate-600 mt-1", children: "AI-Powered Clinical Intelligence & Predictive Insights" })
            ] })
          ] }),
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ s.jsx("div", { className: "px-4 py-2 rounded-full bg-emerald-100 border border-emerald-200", children: /* @__PURE__ */ s.jsx("span", { className: "text-sm font-semibold text-emerald-700", children: "🟢 Analysis Complete" }) }),
            /* @__PURE__ */ s.jsx("div", { className: "px-4 py-2 rounded-full bg-blue-100 border border-blue-200", children: /* @__PURE__ */ s.jsx("span", { className: "text-sm font-semibold text-blue-700", children: "⚡ Real-time" }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ s.jsx("div", { className: "flex-1 min-h-0 p-12 overflow-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent", children: /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-12 gap-12 h-full max-w-[1800px] mx-auto", children: [
        /* @__PURE__ */ s.jsxs("div", { className: "col-span-4 space-y-8", children: [
          /* @__PURE__ */ s.jsxs(
            D.div,
            {
              initial: { opacity: 0, x: -20 },
              animate: { opacity: 1, x: 0 },
              transition: { duration: 0.6 },
              className: "relative p-8 rounded-3xl bg-gradient-to-br from-white via-blue-50/30 to-violet-50/20 border border-white/40 shadow-xl backdrop-blur-sm",
              children: [
                /* @__PURE__ */ s.jsx("div", { className: "absolute inset-0 bg-gradient-to-br from-blue-500/5 to-violet-500/5 rounded-3xl" }),
                /* @__PURE__ */ s.jsxs("div", { className: "relative", children: [
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between mb-6", children: [
                    /* @__PURE__ */ s.jsx("h3", { className: "font-bold text-slate-800", children: "Health Intelligence Score" }),
                    /* @__PURE__ */ s.jsx("div", { className: "w-3 h-3 rounded-full bg-emerald-400 animate-pulse" })
                  ] }),
                  /* @__PURE__ */ s.jsxs("div", { className: "relative w-32 h-32 mx-auto mb-6", children: [
                    /* @__PURE__ */ s.jsxs("svg", { className: "w-32 h-32 transform -rotate-90", viewBox: "0 0 120 120", children: [
                      /* @__PURE__ */ s.jsx(
                        "circle",
                        {
                          cx: "60",
                          cy: "60",
                          r: "45",
                          stroke: "#e2e8f0",
                          strokeWidth: "8",
                          fill: "none",
                          className: "opacity-20"
                        }
                      ),
                      /* @__PURE__ */ s.jsx(
                        D.circle,
                        {
                          cx: "60",
                          cy: "60",
                          r: "45",
                          stroke: "url(#healthGradient)",
                          strokeWidth: "8",
                          fill: "none",
                          strokeLinecap: "round",
                          initial: { strokeDasharray: 0 },
                          animate: { strokeDasharray: "240 283" },
                          transition: { duration: 2, ease: "easeOut" }
                        }
                      ),
                      /* @__PURE__ */ s.jsx("defs", { children: /* @__PURE__ */ s.jsxs("linearGradient", { id: "healthGradient", x1: "0%", y1: "0%", x2: "100%", y2: "100%", children: [
                        /* @__PURE__ */ s.jsx("stop", { offset: "0%", stopColor: "#10b981" }),
                        /* @__PURE__ */ s.jsx("stop", { offset: "50%", stopColor: "#3b82f6" }),
                        /* @__PURE__ */ s.jsx("stop", { offset: "100%", stopColor: "#8b5cf6" })
                      ] }) })
                    ] }),
                    /* @__PURE__ */ s.jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ s.jsxs("div", { className: "text-center", children: [
                      /* @__PURE__ */ s.jsx("div", { className: "text-3xl font-bold text-slate-800", children: "94" }),
                      /* @__PURE__ */ s.jsx("div", { className: "text-sm text-slate-600", children: "/ 100" })
                    ] }) })
                  ] }),
                  /* @__PURE__ */ s.jsxs("div", { className: "text-center", children: [
                    /* @__PURE__ */ s.jsx("p", { className: "text-emerald-600 font-semibold mb-2", children: "Excellent Health Profile" }),
                    /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "Based on 47 clinical markers" })
                  ] })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ s.jsxs(
            D.div,
            {
              initial: { opacity: 0, x: -20 },
              animate: { opacity: 1, x: 0 },
              transition: { duration: 0.6, delay: 0.2 },
              className: "p-8 rounded-3xl bg-gradient-to-br from-white via-amber-50/30 to-orange-50/20 border border-white/40 shadow-xl backdrop-blur-sm",
              children: [
                /* @__PURE__ */ s.jsx("h3", { className: "font-bold text-slate-800 mb-4", children: "Risk Assessment Matrix" }),
                /* @__PURE__ */ s.jsxs("div", { className: "space-y-4", children: [
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100", children: [
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                      /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 rounded-full bg-emerald-400" }),
                      /* @__PURE__ */ s.jsx("span", { className: "text-sm font-medium text-slate-700", children: "Cardiovascular" })
                    ] }),
                    /* @__PURE__ */ s.jsx("span", { className: "text-sm font-bold text-emerald-600", children: "Low Risk" })
                  ] }),
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between p-3 rounded-xl bg-yellow-50 border border-yellow-100", children: [
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                      /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 rounded-full bg-yellow-400" }),
                      /* @__PURE__ */ s.jsx("span", { className: "text-sm font-medium text-slate-700", children: "Hypertension" })
                    ] }),
                    /* @__PURE__ */ s.jsx("span", { className: "text-sm font-bold text-yellow-600", children: "Monitor" })
                  ] }),
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100", children: [
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
                      /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 rounded-full bg-emerald-400" }),
                      /* @__PURE__ */ s.jsx("span", { className: "text-sm font-medium text-slate-700", children: "Diabetes" })
                    ] }),
                    /* @__PURE__ */ s.jsx("span", { className: "text-sm font-bold text-emerald-600", children: "Low Risk" })
                  ] })
                ] })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ s.jsxs("div", { className: "col-span-5 space-y-8", children: [
          /* @__PURE__ */ s.jsxs(
            D.div,
            {
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.6, delay: 0.1 },
              className: "p-8 rounded-3xl bg-gradient-to-br from-white via-violet-50/30 to-purple-50/20 border border-white/40 shadow-xl backdrop-blur-sm",
              children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between mb-6", children: [
                  /* @__PURE__ */ s.jsx("h3", { className: "font-bold text-slate-800", children: "Neural Analysis Pathways" }),
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 border border-violet-200", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 rounded-full bg-violet-500 animate-pulse" }),
                    /* @__PURE__ */ s.jsx("span", { className: "text-xs font-semibold text-violet-700", children: "Processing" })
                  ] })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "relative h-48 bg-gradient-to-r from-violet-100/50 to-purple-100/50 rounded-2xl p-6 overflow-hidden", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ s.jsxs("div", { className: "grid grid-cols-4 gap-8 w-full h-full items-center", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "flex flex-col gap-3 items-center", children: [1, 2, 3, 4].map((C) => /* @__PURE__ */ s.jsx(
                      D.div,
                      {
                        className: "w-3 h-3 rounded-full bg-blue-400",
                        animate: { scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] },
                        transition: { duration: 2, delay: C * 0.1, repeat: 1 / 0 }
                      },
                      `input-${C}`
                    )) }),
                    /* @__PURE__ */ s.jsx("div", { className: "flex flex-col gap-2 items-center", children: [1, 2, 3, 4, 5, 6].map((C) => /* @__PURE__ */ s.jsx(
                      D.div,
                      {
                        className: "w-2.5 h-2.5 rounded-full bg-violet-400",
                        animate: { scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] },
                        transition: { duration: 2.5, delay: C * 0.05, repeat: 1 / 0 }
                      },
                      `hidden1-${C}`
                    )) }),
                    /* @__PURE__ */ s.jsx("div", { className: "flex flex-col gap-2 items-center", children: [1, 2, 3, 4, 5, 6].map((C) => /* @__PURE__ */ s.jsx(
                      D.div,
                      {
                        className: "w-2.5 h-2.5 rounded-full bg-purple-400",
                        animate: { scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] },
                        transition: { duration: 2.2, delay: C * 0.07, repeat: 1 / 0 }
                      },
                      `hidden2-${C}`
                    )) }),
                    /* @__PURE__ */ s.jsx("div", { className: "flex flex-col gap-4 items-center", children: [1, 2, 3].map((C) => /* @__PURE__ */ s.jsx(
                      D.div,
                      {
                        className: "w-4 h-4 rounded-full bg-emerald-400",
                        animate: { scale: [1, 1.4, 1], opacity: [0.8, 1, 0.8] },
                        transition: { duration: 3, delay: C * 0.2, repeat: 1 / 0 }
                      },
                      `output-${C}`
                    )) })
                  ] }) }),
                  /* @__PURE__ */ s.jsxs("div", { className: "absolute bottom-2 left-4 right-4 flex justify-between text-xs text-slate-600", children: [
                    /* @__PURE__ */ s.jsx("span", { children: "Symptoms" }),
                    /* @__PURE__ */ s.jsx("span", { children: "Processing" }),
                    /* @__PURE__ */ s.jsx("span", { children: "Analysis" }),
                    /* @__PURE__ */ s.jsx("span", { children: "Insights" })
                  ] })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ s.jsxs(
            D.div,
            {
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.6, delay: 0.3 },
              className: "p-8 rounded-3xl bg-gradient-to-br from-white via-emerald-50/30 to-blue-50/20 border border-white/40 shadow-xl backdrop-blur-sm",
              children: [
                /* @__PURE__ */ s.jsx("h3", { className: "font-bold text-slate-800 mb-4", children: "Predictive Clinical Insights" }),
                /* @__PURE__ */ s.jsxs("div", { className: "space-y-4", children: [
                  /* @__PURE__ */ s.jsx("div", { className: "p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-200/50", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ s.jsx(Cs, { size: 16, className: "text-white" }) }),
                    /* @__PURE__ */ s.jsxs("div", { children: [
                      /* @__PURE__ */ s.jsx("h4", { className: "font-semibold text-slate-800 mb-2", children: "Hypertension Risk Analysis" }),
                      /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mb-3", children: "Current BP readings (142/88) indicate Stage 1 hypertension. AI models predict 73% likelihood of sustained elevation without intervention." }),
                      /* @__PURE__ */ s.jsxs("div", { className: "flex flex-wrap gap-2", children: [
                        /* @__PURE__ */ s.jsx("span", { className: "px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium", children: "Lifestyle Modifications" }),
                        /* @__PURE__ */ s.jsx("span", { className: "px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium", children: "2-Week Follow-up" })
                      ] })
                    ] })
                  ] }) }),
                  /* @__PURE__ */ s.jsx("div", { className: "p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200/50", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-start gap-3", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ s.jsx(_e, { size: 16, className: "text-white" }) }),
                    /* @__PURE__ */ s.jsxs("div", { children: [
                      /* @__PURE__ */ s.jsx("h4", { className: "font-semibold text-slate-800 mb-2", children: "Treatment Compliance Prediction" }),
                      /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600 mb-3", children: "Based on patient profile and demographics, AI predicts 89% medication adherence likelihood with proper education." }),
                      /* @__PURE__ */ s.jsxs("div", { className: "flex flex-wrap gap-2", children: [
                        /* @__PURE__ */ s.jsx("span", { className: "px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium", children: "High Adherence" }),
                        /* @__PURE__ */ s.jsx("span", { className: "px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium", children: "Patient Education" })
                      ] })
                    ] })
                  ] }) })
                ] })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ s.jsxs("div", { className: "col-span-3 space-y-8", children: [
          /* @__PURE__ */ s.jsxs(
            D.div,
            {
              initial: { opacity: 0, x: 20 },
              animate: { opacity: 1, x: 0 },
              transition: { duration: 0.6, delay: 0.4 },
              className: "p-8 rounded-3xl bg-gradient-to-br from-white via-slate-50/30 to-gray-50/20 border border-white/40 shadow-xl backdrop-blur-sm",
              children: [
                /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
                  /* @__PURE__ */ s.jsx("h3", { className: "font-bold text-slate-800", children: "Live Vitals Monitor" }),
                  /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 rounded-full bg-red-400 animate-pulse" })
                ] }),
                /* @__PURE__ */ s.jsxs("div", { className: "space-y-4", children: [
                  /* @__PURE__ */ s.jsxs("div", { className: "p-3 rounded-xl bg-red-50 border border-red-100", children: [
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                      /* @__PURE__ */ s.jsx("span", { className: "text-sm font-medium text-slate-700", children: "Blood Pressure" }),
                      /* @__PURE__ */ s.jsx("span", { className: "text-xs text-red-600 font-semibold", children: "⚠ Elevated" })
                    ] }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-red-700", children: "142/88" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600 mt-1", children: "mmHg • Stage 1 HTN" })
                  ] }),
                  /* @__PURE__ */ s.jsxs("div", { className: "p-3 rounded-xl bg-emerald-50 border border-emerald-100", children: [
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                      /* @__PURE__ */ s.jsx("span", { className: "text-sm font-medium text-slate-700", children: "Heart Rate" }),
                      /* @__PURE__ */ s.jsx("span", { className: "text-xs text-emerald-600 font-semibold", children: "✓ Normal" })
                    ] }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-emerald-700", children: "78" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600 mt-1", children: "bpm • Resting" })
                  ] }),
                  /* @__PURE__ */ s.jsxs("div", { className: "p-3 rounded-xl bg-blue-50 border border-blue-100", children: [
                    /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                      /* @__PURE__ */ s.jsx("span", { className: "text-sm font-medium text-slate-700", children: "O₂ Saturation" }),
                      /* @__PURE__ */ s.jsx("span", { className: "text-xs text-blue-600 font-semibold", children: "✓ Optimal" })
                    ] }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-2xl font-bold text-blue-700", children: "97%" }),
                    /* @__PURE__ */ s.jsx("div", { className: "text-xs text-slate-600 mt-1", children: "SpO₂" })
                  ] })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ s.jsxs(
            D.div,
            {
              initial: { opacity: 0, x: 20 },
              animate: { opacity: 1, x: 0 },
              transition: { duration: 0.6, delay: 0.5 },
              className: "p-8 rounded-3xl bg-gradient-to-br from-white via-orange-50/30 to-yellow-50/20 border border-white/40 shadow-xl backdrop-blur-sm",
              children: [
                /* @__PURE__ */ s.jsx("h3", { className: "font-bold text-slate-800 mb-4", children: "Priority Action Items" }),
                /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 p-3 rounded-xl bg-orange-50 border border-orange-100", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ s.jsx("span", { className: "text-xs font-bold text-white", children: "1" }) }),
                    /* @__PURE__ */ s.jsxs("div", { children: [
                      /* @__PURE__ */ s.jsx("p", { className: "text-sm font-medium text-slate-800", children: "BP Monitoring Protocol" }),
                      /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600", children: "Schedule 2-week follow-up" })
                    ] })
                  ] }),
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ s.jsx("span", { className: "text-xs font-bold text-white", children: "2" }) }),
                    /* @__PURE__ */ s.jsxs("div", { children: [
                      /* @__PURE__ */ s.jsx("p", { className: "text-sm font-medium text-slate-800", children: "Patient Education" }),
                      /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600", children: "Lifestyle modifications" })
                    ] })
                  ] }),
                  /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3 p-3 rounded-xl bg-violet-50 border border-violet-100", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ s.jsx("span", { className: "text-xs font-bold text-white", children: "3" }) }),
                    /* @__PURE__ */ s.jsxs("div", { children: [
                      /* @__PURE__ */ s.jsx("p", { className: "text-sm font-medium text-slate-800", children: "Lab Workup" }),
                      /* @__PURE__ */ s.jsx("p", { className: "text-xs text-slate-600", children: "CBC, CMP panels" })
                    ] })
                  ] })
                ] })
              ]
            }
          )
        ] })
      ] }) }),
      /* @__PURE__ */ s.jsx("div", { className: "px-12 py-6 bg-gradient-to-r from-white/80 to-violet-50/80 backdrop-blur-xl border-t border-white/20", children: /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-100 border border-emerald-200", children: [
            /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 rounded-full bg-emerald-500" }),
            /* @__PURE__ */ s.jsx("span", { className: "text-sm font-semibold text-emerald-700", children: "Analysis Complete" })
          ] }),
          /* @__PURE__ */ s.jsx("span", { className: "text-sm text-slate-600", children: "Generated in 0.847s using 12 AI models" })
        ] }),
        /* @__PURE__ */ s.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ s.jsx(Q, { variant: "outline", size: "sm", className: "rounded-full", children: "Export Report" }),
          /* @__PURE__ */ s.jsx(Q, { size: "sm", className: "rounded-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700", children: "Apply Recommendations" })
        ] })
      ] }) })
    ] }) })
  ] });
}
const Fv = [
  { id: 1, title: "Analyzing Content", status: "completed" },
  { id: 2, title: "Enhancing Structure", status: "completed" },
  { id: 3, title: "Beautifying Language", status: "in-progress" },
  { id: 4, title: "Final Review", status: "pending" }
], zv = ["pending", "in-progress", "confirmed", "completed"];
function hu(e, t) {
  if (typeof e == "number" && Number.isFinite(e)) return e;
  const n = Number(e);
  return Number.isFinite(n) ? n : t + 1;
}
function _v(e, t) {
  return t && t.trim() ? t : e ? /^\d{4,5}$/.test(e) ? "CPT" : (/^[A-Z][0-9A-Z]/i.test(e), "ICD-10") : "ICD-10";
}
function Cn(e) {
  if (!e) return;
  const t = e.toLowerCase();
  if (t.includes("differential")) return "differential";
  if (t.includes("prevent")) return "prevention";
  if (t.includes("diagn")) return "diagnosis";
  if (t.includes("code") || t.includes("procedure")) return "code";
}
function $v(e) {
  const t = /* @__PURE__ */ new Set(), n = e.classification;
  if (Array.isArray(n))
    n.forEach((a) => {
      if (typeof a == "string") {
        const o = Cn(a);
        o && t.add(o);
      }
    });
  else if (typeof n == "string") {
    const a = Cn(n);
    a && t.add(a);
  }
  const r = typeof e.category == "string" ? e.category.toLowerCase() : "", i = Cn(r);
  return i && t.add(i), Array.isArray(e.tags) && e.tags.forEach((a) => {
    if (typeof a == "string") {
      const o = Cn(a);
      o && t.add(o);
    }
  }), e.codeType === "CPT" ? t.add("code") : (e.codeType || "").toUpperCase() === "ICD-10" && t.add("diagnosis"), e.code && /^\d{4,5}$/.test(e.code) && t.add("code"), t.size || t.add("diagnosis"), Array.from(t.values());
}
function fu(e) {
  return e && zv.includes(e) ? e : "pending";
}
function Ko(e) {
  return !e || !Array.isArray(e) ? [] : e.map((t, n) => {
    const r = hu(t.id, n), i = t.title || (t.code ? `${t.code}` : `Item ${n + 1}`), a = fu(t.status), o = t.details || t.description || "", l = _v(t.code, t.codeType), c = l === "CPT" ? "CPT" : "ICD-10", u = Array.isArray(t.evidence) ? t.evidence : [], d = Array.isArray(t.gaps) ? t.gaps : [], m = $v(t);
    return {
      ...t,
      id: r,
      title: i,
      status: a,
      details: o,
      codeType: l,
      category: c,
      evidence: u,
      gaps: d,
      classifications: m
    };
  });
}
function Bv(e) {
  return !e || !Array.isArray(e) ? [] : e.map((t, n) => {
    const r = hu(t.id, n), i = t.title || t.code || `Compliance ${n + 1}`, a = t.description || "", o = fu(t.status);
    return {
      ...t,
      id: r,
      title: i,
      description: a,
      status: o
    };
  });
}
function Wv(e) {
  const t = /* @__PURE__ */ new Map();
  return e && e.forEach((n) => {
    n && typeof n.id == "number" && t.set(n.id, n);
  }), t;
}
function pu(e) {
  return e?.name || "Patient";
}
function oi(e) {
  const t = pu(e), n = e?.encounterDate || (/* @__PURE__ */ new Date()).toLocaleDateString();
  return `PATIENT: ${t}
DATE: ${n}

CHIEF COMPLAINT:
Chest pain for 2 days.

HISTORY OF PRESENT ILLNESS:
Patient reports chest pain. Started 2 days ago. Pain is sharp. Located in precordial region. Intermittent. Worsens with activity. Smoking history 1 pack per day for 30 years.

PHYSICAL EXAMINATION:
GENERAL: Alert, oriented, comfortable at rest
CARDIOVASCULAR: Regular rate and rhythm, no murmurs, no peripheral edema
RESPIRATORY: Clear to auscultation bilaterally
EXTREMITIES: No cyanosis, clubbing, or edema

ASSESSMENT:
Chest pain, likely musculoskeletal. Given smoking history and age, cardiac evaluation warranted.

PLAN:
1. EKG to rule out cardiac abnormalities
2. Basic metabolic panel and lipid profile
3. Consider stress testing if symptoms persist
4. Smoking cessation counseling provided`;
}
function ks(e, t) {
  return (e && e.trim() ? e : oi(t)).split(`
`).map((r) => r.trim()).filter(Boolean).map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(`
`);
}
function Ts(e, t) {
  const n = pu(t), r = t?.encounterDate || (/* @__PURE__ */ new Date()).toLocaleDateString(), i = e.split(`
`).map((o) => o.trim()).filter(Boolean).slice(0, 6), a = i.length ? i.map((o) => `• ${o}`).join(`
`) : "• Documentation not yet available. Please review the clinical note for details.";
  return `VISIT SUMMARY FOR: ${n}
DATE: ${r}

KEY POINTS:
${a}`;
}
function Uv(e) {
  return e ? e === 1 ? "Review 1 compliance item prior to attestation" : `Review ${e} compliance items prior to attestation` : "Final review, billing verification, and attestation";
}
function Hv({
  selectedCodes: e = [],
  suggestedCodes: t = [],
  complianceItems: n = [],
  noteContent: r = "",
  patientMetadata: i,
  reimbursementSummary: a,
  transcriptEntries: o,
  blockingIssues: l,
  stepOverrides: c,
  onClose: u,
  onFinalize: d,
  onStepChange: m
}) {
  const h = Y.useMemo(
    () => Ko(e),
    [e]
  ), f = Y.useMemo(
    () => Ko(t),
    [t]
  ), v = Y.useMemo(
    () => Bv(n),
    [n]
  ), g = Y.useMemo(() => Array.isArray(o) ? o.map((I, K) => {
    const ae = typeof I?.text == "string" ? I.text.trim() : "";
    if (!ae) return null;
    const Te = typeof I?.speaker == "string" && I.speaker.trim().length > 0 ? I.speaker.trim() : void 0;
    let X;
    typeof I?.timestamp == "number" && Number.isFinite(I.timestamp) ? X = I.timestamp : typeof I?.timestamp == "string" && I.timestamp.trim().length > 0 && (X = I.timestamp.trim());
    const se = typeof I?.confidence == "number" && Number.isFinite(I.confidence) ? Math.max(0, Math.min(1, I.confidence)) : void 0;
    return {
      id: I?.id ?? K + 1,
      speaker: Te,
      text: ae,
      timestamp: X,
      confidence: se
    };
  }).filter((I) => !!I) : [], [o]), N = Y.useMemo(
    () => Wv(c),
    [c]
  ), j = Y.useRef(
    r || oi(i)
  ), [b, y] = Y.useState(
    j.current
  ), [S, T] = Y.useState(
    () => ks(j.current, i)
  ), [E, A] = Y.useState(
    () => Ts(j.current, i)
  ), [k, L] = Y.useState(1), [O, q] = Y.useState(null), [P, be] = Y.useState(!1), [me, pe] = Y.useState([]), [de, re] = Y.useState(!1), [w, B] = Y.useState(!1), [W, G] = Y.useState(null), [xe, oe] = Y.useState(null);
  Y.useEffect(() => {
    xe || (oe(null), G(null));
  }, [
    xe,
    h,
    f,
    v,
    b
  ]), Y.useEffect(() => {
    const I = r || oi(i);
    r && r !== b ? (y(r), T(
      ks(r, i)
    ), A(
      Ts(r, i)
    )) : !r && b === j.current && (y(I), T(ks(I, i)), A(Ts(I, i))), j.current = I;
  }, [r, i, b]), Y.useEffect(() => {
    !h.length && !f.length && L(3);
  }, [h.length, f.length]);
  const ee = Y.useMemo(() => {
    const I = Uv(
      v.length
    ), K = l?.filter(
      (X) => typeof X == "string" && X.trim().length > 0
    ) ?? [], ae = w ? "Finalizing note and preparing export package..." : xe ? xe.exportReady ? "Note finalized and ready for export" : "Finalized with outstanding issues that need review" : K.length ? `Review ${K.length} blocking issue${K.length === 1 ? "" : "s"} before dispatch` : "Final confirmation and submission", Te = [
      {
        id: 1,
        title: "Code Review",
        description: "Review and validate your selected diagnostic codes",
        type: "selected-codes",
        stepType: "selected",
        totalSelected: h.length,
        totalSuggestions: f.length,
        items: h
      },
      {
        id: 2,
        title: "Suggestion Review",
        description: "Evaluate AI-recommended diagnostic codes",
        type: "suggested-codes",
        stepType: "suggested",
        totalSelected: h.length,
        totalSuggestions: f.length,
        items: f
      },
      {
        id: 3,
        title: "Compose",
        description: "AI beautification and enhancement",
        type: "loading",
        progressSteps: Fv
      },
      {
        id: 4,
        title: "Compare & Edit",
        description: "Compare original draft with beautified version",
        type: "dual-editor",
        originalContent: b,
        beautifiedContent: S,
        patientSummaryContent: E
      },
      {
        id: 5,
        title: "Billing & Attest",
        description: I,
        type: "placeholder"
      },
      {
        id: 6,
        title: "Sign & Dispatch",
        description: ae,
        type: "dispatch"
      }
    ];
    return N.size ? Te.map((X) => {
      const se = N.get(X.id);
      return se ? { ...X, ...se } : X;
    }) : Te;
  }, [
    h,
    f,
    v.length,
    b,
    S,
    E,
    N,
    w,
    xe
  ]);
  Y.useEffect(() => {
    if (!ee.length) return;
    ee.some((K) => K.id === k) || L(ee[0].id);
  }, [ee, k]);
  const Z = Y.useMemo(
    () => ee.find((I) => I.id === k) ?? ee[0],
    [ee, k]
  ), we = Y.useCallback(
    (I) => {
      if (!ee.length) return;
      const K = ee[0], ae = ee.find((Te) => Te.id === I) || K;
      L(ae.id);
    },
    [ee]
  );
  Y.useEffect(() => {
    Z && m?.(Z.id, Z);
  }, [Z, m]);
  const le = Y.useCallback(
    (I) => {
      const K = [];
      return I.find((X) => X.id === 1)?.items?.forEach((X, se) => {
        X.gaps.forEach((he, Se) => {
          const ct = X.id || se + 1, kt = Number.isFinite(ct) ? +`${ct}${Se}` : Date.now() + Se, vt = he.toLowerCase(), Gt = vt.includes("smok") ? "high" : (vt.includes("lab") || vt.includes("lipid"), "medium");
          K.push({
            id: Number.isFinite(kt) ? kt : se * 100 + Se,
            question: he.endsWith("?") ? he : `Can you clarify: ${he}?`,
            source: `Code Gap: ${X.title}`,
            priority: Gt,
            codeRelated: X.code || X.title,
            category: "clinical"
          });
        });
      }), I.find((X) => X.id === 2)?.items?.forEach((X, se) => {
        if (X.classifications.includes("prevention")) {
          const he = X.id || se + 1, Se = Number.isFinite(he) ? +`${he}90` : Date.now() + se;
          K.push({
            id: Number.isFinite(Se) ? Se : se * 200,
            question: `What preventive documentation supports ${X.title}?`,
            source: `Prevention Opportunity: ${X.title}`,
            priority: "low",
            codeRelated: X.code || X.title,
            category: "clinical"
          });
        }
      }), K;
    },
    []
  );
  Y.useEffect(() => {
    ee.length && (k === 1 || k === 2) && pe(le(ee));
  }, [k, ee, le]);
  const Le = Y.useCallback(
    (I) => {
      y(I), T(ks(I, i)), A(Ts(I, i));
    },
    [i]
  ), He = Y.useCallback(
    (I) => {
      if (!I) return;
      let K = b.length;
      const ae = I.toLowerCase();
      if (ae.includes("smoking") || ae.includes("cigarette")) {
        const se = b.indexOf("HISTORY OF PRESENT ILLNESS:");
        if (se !== -1) {
          const he = b.indexOf(`

`, se);
          K = he !== -1 ? he : b.length;
        }
      } else if (ae.includes("weight") || ae.includes("bmi")) {
        const se = b.indexOf("PHYSICAL EXAMINATION:");
        if (se !== -1) {
          const he = b.indexOf(`

`, se);
          K = he !== -1 ? he : b.length;
        }
      } else if (ae.includes("family history")) {
        const se = b.indexOf("ASSESSMENT:");
        se !== -1 && (K = se);
      }
      const Te = `

ADDITIONAL INFORMATION:
${I}`, X = b.slice(0, K) + Te + b.slice(K);
      Le(X);
    },
    [b, Le]
  ), Ge = Y.useMemo(() => !O || !b || !P ? [] : (Array.isArray(O.evidence) ? O.evidence : []).reduce((K, ae, Te) => {
    const X = b.toLowerCase().indexOf(ae.toLowerCase());
    return X !== -1 && K.push({
      start: X,
      end: X + ae.length,
      className: Te % 3 === 0 ? "highlight-blue" : Te % 3 === 1 ? "highlight-emerald" : "highlight-amber",
      label: `Evidence ${Te + 1}`,
      text: ae
    }), K;
  }, []), [O, b, P]), Qe = Y.useCallback(() => {
    const I = /* @__PURE__ */ new Set(), K = /* @__PURE__ */ new Set(), ae = /* @__PURE__ */ new Set(), Te = /* @__PURE__ */ new Set(), X = /* @__PURE__ */ new Set(), se = (he) => {
      const Se = he.code || he.title;
      if (Se) {
        if (!he.classifications.length) {
          he.codeType === "CPT" ? I.add(Se) : ae.add(Se);
          return;
        }
        he.classifications.forEach((ct) => {
          switch (ct) {
            case "code":
              I.add(Se);
              break;
            case "prevention":
              K.add(Se);
              break;
            case "diagnosis":
              ae.add(Se);
              break;
            case "differential":
              Te.add(Se);
              break;
          }
        });
      }
    };
    return h.forEach(se), f.forEach(se), v.forEach((he) => {
      const Se = he.code || he.title;
      Se && X.add(Se);
    }), {
      content: b,
      codes: Array.from(I),
      prevention: Array.from(K),
      diagnoses: Array.from(ae),
      differentials: Array.from(Te),
      compliance: Array.from(X),
      patient: i
    };
  }, [
    b,
    h,
    f,
    v,
    i
  ]), tt = Y.useCallback(async () => {
    const I = Qe();
    B(!0), G(null);
    try {
      const K = await Promise.resolve(d?.(I));
      oe(K || {
        finalizedContent: I.content.trim(),
        codesSummary: I.codes.map((ae) => ({ code: ae })),
        reimbursementSummary: { total: 0, codes: [] },
        exportReady: !0,
        issues: {}
      });
    } catch (K) {
      G(
        K instanceof Error ? K.message : "Failed to finalize note. Please try again."
      );
    } finally {
      B(!1);
    }
  }, [Qe, d]), Dt = w ? "Finalizing..." : xe ? "Dispatch Finalized Note" : "Finalize & Dispatch";
  return /* @__PURE__ */ s.jsxs("div", { className: "h-screen bg-white flex flex-col overflow-hidden relative", children: [
    /* @__PURE__ */ s.jsx(
      D.div,
      {
        className: "absolute inset-0",
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.8, ease: "easeOut", delay: 0.8 },
        style: {
          background: "linear-gradient(135deg, #fdfdff 0%, #fcfcff 25%, #fafaff 50%, #f9f9ff 75%, #fdfdff 100%)"
        }
      }
    ),
    /* @__PURE__ */ s.jsxs(
      D.div,
      {
        className: "relative z-10 h-full flex flex-col",
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.5, ease: "easeOut" },
        children: [
          /* @__PURE__ */ s.jsxs(
            D.div,
            {
              className: "border-b border-white/20 shadow-sm relative",
              style: {
                background: "linear-gradient(135deg, #fefefe 0%, #fdfdfd 50%, #fcfcfc 100%)"
              },
              initial: { opacity: 0, y: -20 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.5, ease: "easeOut", delay: 0.2 },
              children: [
                /* @__PURE__ */ s.jsx(
                  vx,
                  {
                    steps: ee,
                    currentStep: Z?.id ?? 1,
                    onStepClick: we
                  }
                ),
                u && /* @__PURE__ */ s.jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: () => u(xe ?? void 0),
                    className: "absolute top-6 right-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800",
                    children: [
                      /* @__PURE__ */ s.jsx(Fn, { size: 16 }),
                      "Close"
                    ]
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ s.jsx(
            D.div,
            {
              className: "flex-1 flex overflow-hidden",
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              transition: { duration: 0.6, ease: "easeOut", delay: 0.3 },
              children: Z?.type === "loading" ? /* @__PURE__ */ s.jsx(
                D.div,
                {
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  className: "w-full flex items-center justify-center",
                  style: {
                    background: "linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)"
                  },
                  children: /* @__PURE__ */ s.jsxs("div", { className: "text-center max-w-md", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto mb-6 flex items-center justify-center", children: /* @__PURE__ */ s.jsx(
                      D.div,
                      {
                        animate: { rotate: 360 },
                        transition: { duration: 2, repeat: 1 / 0, ease: "linear" },
                        children: /* @__PURE__ */ s.jsx(Ln, { size: 32, className: "text-white" })
                      }
                    ) }),
                    /* @__PURE__ */ s.jsx("h2", { className: "text-xl font-semibold text-slate-800 mb-2", children: "AI Enhancement in Progress" }),
                    /* @__PURE__ */ s.jsx("p", { className: "text-slate-600 mb-8", children: "Analyzing and beautifying your medical documentation..." }),
                    /* @__PURE__ */ s.jsx("div", { className: "space-y-4", children: Z.progressSteps?.map((I, K) => /* @__PURE__ */ s.jsxs(
                      D.div,
                      {
                        initial: { opacity: 0, x: -20 },
                        animate: { opacity: 1, x: 0 },
                        transition: { delay: K * 0.2 },
                        className: `flex items-center gap-3 p-3 rounded-lg ${I.status === "completed" ? "bg-emerald-50 border border-emerald-200" : I.status === "in-progress" ? "bg-blue-50 border border-blue-200" : "bg-slate-50 border border-slate-200"}`,
                        children: [
                          /* @__PURE__ */ s.jsx(
                            "div",
                            {
                              className: `w-6 h-6 rounded-full flex items-center justify-center ${I.status === "completed" ? "bg-emerald-500" : I.status === "in-progress" ? "bg-blue-500" : "bg-slate-300"}`,
                              children: I.status === "completed" ? /* @__PURE__ */ s.jsx(_e, { size: 14, className: "text-white" }) : I.status === "in-progress" ? /* @__PURE__ */ s.jsx(
                                D.div,
                                {
                                  animate: { rotate: 360 },
                                  transition: {
                                    duration: 1,
                                    repeat: 1 / 0,
                                    ease: "linear"
                                  },
                                  className: "w-3 h-3 border-2 border-white border-t-transparent rounded-full"
                                }
                              ) : /* @__PURE__ */ s.jsx("div", { className: "w-2 h-2 bg-white rounded-full" })
                            }
                          ),
                          /* @__PURE__ */ s.jsx(
                            "span",
                            {
                              className: `font-medium ${I.status === "completed" ? "text-emerald-700" : I.status === "in-progress" ? "text-blue-700" : "text-slate-600"}`,
                              children: I.title
                            }
                          )
                        ]
                      },
                      I.id
                    )) }),
                    /* @__PURE__ */ s.jsx(
                      D.button,
                      {
                        onClick: () => we(4),
                        className: "mt-8 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-indigo-700 transition-all",
                        whileHover: { scale: 1.05 },
                        whileTap: { scale: 0.95 },
                        children: "Continue to Compare & Edit"
                      }
                    )
                  ] })
                }
              ) : Z?.type === "dual-editor" ? /* @__PURE__ */ s.jsx(
                Lv,
                {
                  originalContent: Z.originalContent || "",
                  aiEnhancedContent: Z.beautifiedContent || "",
                  patientSummaryContent: Z.patientSummaryContent || "",
                  patientMetadata: i,
                  transcriptEntries: g,
                  selectedCodes: h,
                  suggestedCodes: f,
                  reimbursementSummary: a,
                  onAcceptAllChanges: () => {
                    Le(S);
                  },
                  onReBeautify: () => {
                    const I = ks(b, i);
                    T(I), A(Ts(b, i));
                  },
                  onContentChange: (I, K) => {
                    K === "original" ? Le(I) : K === "enhanced" ? T(I) : A(I);
                  },
                  onNavigateNext: () => {
                    we(5);
                  },
                  onNavigatePrevious: () => {
                    we(3);
                  }
                }
              ) : Z?.type === "placeholder" || Z?.type === "dispatch" ? /* @__PURE__ */ s.jsx(
                D.div,
                {
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  className: "w-full flex items-center justify-center",
                  style: {
                    background: "linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)"
                  },
                  children: /* @__PURE__ */ s.jsxs("div", { className: "text-center max-w-md space-y-6", children: [
                    /* @__PURE__ */ s.jsx("div", { className: "w-24 h-24 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full mx-auto mb-6 flex items-center justify-center text-white text-2xl font-bold", children: Z.id }),
                    /* @__PURE__ */ s.jsxs("div", { className: "space-y-3", children: [
                      /* @__PURE__ */ s.jsx("h2", { className: "text-xl font-semibold text-slate-800", children: Z.title }),
                      /* @__PURE__ */ s.jsx("p", { className: "text-slate-600", children: Z.description })
                    ] }),
                    /* @__PURE__ */ s.jsx("div", { className: "bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-4", children: Z.type === "dispatch" ? /* @__PURE__ */ s.jsx(s.Fragment, { children: w ? /* @__PURE__ */ s.jsxs("div", { className: "flex items-center justify-center gap-3 text-slate-600", children: [
                      /* @__PURE__ */ s.jsx(U0, { className: "h-5 w-5 animate-spin" }),
                      /* @__PURE__ */ s.jsx("span", { children: "Finalizing note..." })
                    ] }) : W ? /* @__PURE__ */ s.jsx("p", { className: "text-sm text-red-600", children: W }) : xe ? /* @__PURE__ */ s.jsxs("div", { className: "text-left space-y-2", children: [
                      /* @__PURE__ */ s.jsxs("p", { className: "text-sm text-slate-600", children: [
                        /* @__PURE__ */ s.jsx("span", { className: "font-semibold text-slate-700", children: "Status:" }),
                        " ",
                        xe.exportReady ? "Ready for export" : "Review outstanding issues"
                      ] }),
                      /* @__PURE__ */ s.jsxs("p", { className: "text-sm text-slate-600", children: [
                        /* @__PURE__ */ s.jsx("span", { className: "font-semibold text-slate-700", children: "Codes Finalized:" }),
                        " ",
                        xe.codesSummary?.length ?? 0
                      ] }),
                      /* @__PURE__ */ s.jsxs("p", { className: "text-sm text-slate-600", children: [
                        /* @__PURE__ */ s.jsx("span", { className: "font-semibold text-slate-700", children: "Estimated Reimbursement:" }),
                        " ",
                        "$",
                        (xe.reimbursementSummary?.total ?? 0).toFixed(2)
                      ] })
                    ] }) : /* @__PURE__ */ s.jsx("p", { className: "text-slate-500 italic", children: "This step is under construction." }) }) : v.length ? /* @__PURE__ */ s.jsxs("div", { className: "space-y-2 text-left", children: [
                      /* @__PURE__ */ s.jsx("p", { className: "text-sm text-slate-600", children: "Outstanding compliance items:" }),
                      /* @__PURE__ */ s.jsxs("ul", { className: "text-sm text-slate-700 list-disc list-inside space-y-1", children: [
                        v.slice(0, 5).map((I) => /* @__PURE__ */ s.jsx("li", { children: I.title }, I.id)),
                        v.length > 5 && /* @__PURE__ */ s.jsxs("li", { className: "italic text-slate-500", children: [
                          "+",
                          v.length - 5,
                          " more"
                        ] })
                      ] })
                    ] }) : /* @__PURE__ */ s.jsx("p", { className: "text-slate-500 italic", children: "This step is under construction." }) }),
                    /* @__PURE__ */ s.jsxs("div", { className: "flex justify-center gap-4", children: [
                      /* @__PURE__ */ s.jsx(
                        D.button,
                        {
                          onClick: () => we(Math.max(Z.id - 1, 1)),
                          className: "px-6 py-3 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-all disabled:opacity-60",
                          whileHover: { scale: 1.05 },
                          whileTap: { scale: 0.95 },
                          disabled: Z.id <= 1 || w,
                          children: "Back"
                        }
                      ),
                      Z.type === "dispatch" ? /* @__PURE__ */ s.jsx(
                        D.button,
                        {
                          onClick: tt,
                          className: "px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-60",
                          whileHover: { scale: 1.05 },
                          whileTap: { scale: 0.95 },
                          disabled: w,
                          children: Dt
                        }
                      ) : /* @__PURE__ */ s.jsx(
                        D.button,
                        {
                          onClick: () => we(Z.id + 1),
                          className: "px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-60",
                          whileHover: { scale: 1.05 },
                          whileTap: { scale: 0.95 },
                          disabled: Z.id >= ee.length,
                          children: "Next"
                        }
                      )
                    ] })
                  ] })
                }
              ) : /* @__PURE__ */ s.jsxs(s.Fragment, { children: [
                /* @__PURE__ */ s.jsx(
                  D.div,
                  {
                    initial: { x: -20, opacity: 0 },
                    animate: { x: 0, opacity: 1 },
                    transition: { duration: 0.5, ease: "easeOut", delay: 0.1 },
                    className: "w-1/2 bg-white border-r border-slate-200/50 shadow-sm",
                    children: /* @__PURE__ */ s.jsx(
                      hg,
                      {
                        content: b,
                        onChange: Le,
                        highlightRanges: Ge,
                        disabled: P,
                        questionsCount: Z?.id === 1 || Z?.id === 2 ? me.length : 0,
                        onShowQuestions: () => re(!0),
                        onInsertText: He
                      }
                    )
                  }
                ),
                /* @__PURE__ */ s.jsxs(
                  D.div,
                  {
                    initial: { x: 20, opacity: 0 },
                    animate: { x: 0, opacity: 1 },
                    transition: { duration: 0.5, ease: "easeOut", delay: 0.2 },
                    className: "w-1/2 relative overflow-hidden flex flex-col bg-white",
                    children: [
                      /* @__PURE__ */ s.jsx(
                        D.div,
                        {
                          className: "absolute inset-0",
                          initial: { opacity: 0 },
                          animate: { opacity: 1 },
                          transition: { duration: 0.8, ease: "easeOut", delay: 1 },
                          style: {
                            background: O && O.gaps && O.gaps.length > 0 ? "linear-gradient(135deg, #fffef9 0%, #fffcf5 25%, #fffaf0 50%, #fef9ec 75%, #fffef9 100%)" : "linear-gradient(135deg, #fafcff 0%, #f8faff 25%, #f4f7ff 50%, #f3f5ff 75%, #fafcff 100%)"
                          },
                          children: /* @__PURE__ */ s.jsx(
                            D.div,
                            {
                              className: "absolute inset-0",
                              animate: {
                                background: O && O.gaps && O.gaps.length > 0 ? [
                                  "radial-gradient(circle at 35% 65%, rgba(250, 204, 21, 0.06) 0%, transparent 50%)",
                                  "radial-gradient(circle at 60% 40%, rgba(234, 179, 8, 0.08) 0%, transparent 50%)",
                                  "radial-gradient(circle at 45% 60%, rgba(202, 138, 4, 0.07) 0%, transparent 50%)",
                                  "radial-gradient(circle at 70% 30%, rgba(161, 98, 7, 0.1) 0%, transparent 50%)",
                                  "radial-gradient(circle at 50% 80%, rgba(202, 138, 4, 0.07) 0%, transparent 50%)",
                                  "radial-gradient(circle at 30% 70%, rgba(234, 179, 8, 0.08) 0%, transparent 50%)",
                                  "radial-gradient(circle at 35% 65%, rgba(250, 204, 21, 0.06) 0%, transparent 50%)"
                                ] : [
                                  "radial-gradient(circle at 30% 70%, rgba(59, 130, 246, 0.03) 0%, transparent 50%)",
                                  "radial-gradient(circle at 60% 40%, rgba(79, 70, 229, 0.06) 0%, transparent 50%)",
                                  "radial-gradient(circle at 40% 60%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)",
                                  "radial-gradient(circle at 70% 30%, rgba(147, 51, 234, 0.06) 0%, transparent 50%)",
                                  "radial-gradient(circle at 50% 80%, rgba(126, 34, 206, 0.04) 0%, transparent 50%)",
                                  "radial-gradient(circle at 25% 45%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)",
                                  "radial-gradient(circle at 30% 70%, rgba(59, 130, 246, 0.03) 0%, transparent 50%)"
                                ],
                                backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"]
                              },
                              transition: {
                                background: {
                                  duration: 14,
                                  repeat: 1 / 0,
                                  ease: "easeInOut",
                                  times: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1]
                                },
                                backgroundPosition: {
                                  duration: 20,
                                  repeat: 1 / 0,
                                  ease: "linear"
                                }
                              },
                              style: {
                                backgroundSize: "300% 300%"
                              }
                            }
                          )
                        }
                      ),
                      /* @__PURE__ */ s.jsx(
                        D.div,
                        {
                          className: "relative z-20 flex-1",
                          initial: { opacity: 0, y: 10 },
                          animate: { opacity: 1, y: 0 },
                          transition: { duration: 0.5, ease: "easeOut", delay: 0.4 },
                          children: /* @__PURE__ */ s.jsx(mt, { mode: "wait", children: Z && /* @__PURE__ */ s.jsx(
                            gg,
                            {
                              step: Z,
                              onNext: () => we(Z.id + 1),
                              onPrevious: () => we(Z.id - 1),
                              onActiveItemChange: (I) => q(I),
                              onShowEvidence: be,
                              patientQuestions: me,
                              onUpdatePatientQuestions: pe,
                              showPatientTray: de,
                              onShowPatientTray: re,
                              onInsertToNote: He
                            },
                            Z.id
                          ) })
                        }
                      )
                    ]
                  }
                )
              ] })
            }
          )
        ]
      }
    )
  ] });
}
const Xv = Hv;
export {
  Hv as FinalizationWizard,
  Xv as WorkflowWizard
};
//# sourceMappingURL=index.js.map
