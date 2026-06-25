import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "../styles/globals.css";
import logo from "../styles/logo.png";
import { BsShield, BsTree, BsTrainFront } from "react-icons/bs";
import { FiShoppingCart } from "react-icons/fi";
import { PiPersonSimpleBikeBold } from "react-icons/pi";
import { FaUniversity } from "react-icons/fa";
import { BiMoneyWithdraw } from "react-icons/bi";
import { BsCheckCircleFill } from "react-icons/bs";
import nyuPin from "../styles/icons/nyu.jpg";
import columbiaPin from "../styles/icons/columbia.jpeg";

// Campus coordinates used for both the map pins below and the
// distance_from_nyu / distance_from_columbia values baked into
// neighborhoods.geojson (verified to reproduce those exact distances).
const NYU_COORDS = [-73.9965, 40.7295];
const COLUMBIA_COORDS = [-73.9626, 40.8075];

// Official MTA bullet colors by route code, used both for the subway-lines
// map layer (data-driven via each feature's own "color" property, baked in
// when subway_lines.geojson was built) and for the station click-popup
// route bullets below (looked up here directly, since subway_lines.geojson
// is loaded asynchronously as a URL and isn't available synchronously).
const MTA_ROUTE_COLORS = {
  "1": "#EE352E",
  "2": "#EE352E",
  "3": "#EE352E",
  "4": "#00933C",
  "5": "#00933C",
  "6": "#00933C",
  "7": "#B933AD",
  A: "#0039A6",
  C: "#0039A6",
  E: "#0039A6",
  B: "#FF6319",
  D: "#FF6319",
  F: "#FF6319",
  M: "#FF6319",
  G: "#6CBE45",
  J: "#996633",
  Z: "#996633",
  L: "#A7A9AC",
  N: "#FCCC0A",
  Q: "#FCCC0A",
  R: "#FCCC0A",
  W: "#FCCC0A",
  S: "#808183",
  SIR: "#0039A6",
};

// Estimates a travel-time ETA (in minutes) from a straight-line distance
// (meters) to a campus. There's no live routing/Directions API in this app,
// so this is a heuristic blend of NYC walking and transit speeds:
//  - Under ~0.5mi, assume walking the whole way (~3 mph).
//  - Beyond that, assume a mix of walking + subway/bus, with a flat
//    walk-to-station/wait overhead, at an effective ~9 mph average --
//    a commonly cited rough figure for NYC transit trips of a few miles.
const estimateETA = (distanceMeters) => {
  if (distanceMeters == null || isNaN(distanceMeters)) return null;
  const miles = distanceMeters / 1609.34;
  let minutes;
  if (miles < 0.5) {
    minutes = (miles / 3) * 60;
  } else {
    minutes = 8 + (miles / 9) * 60;
  }
  return Math.max(1, Math.round(minutes));
};

const Home = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const wholeFoodsMarkersRef = useRef([]); // ref to store Whole Foods markers
  const traderJoesMarkersRef = useRef([]); // ref to store Trader Joe's markers
  const nyuMarkerRef = useRef([]); // ref to store the NYU campus marker
  const columbiaMarkerRef = useRef([]); // ref to store the Columbia campus marker
  // Tracks latest nyu/columbia toggle state for use inside the map's hover
  // handlers, which are registered once on mount and would otherwise close
  // over stale state.
  const universityFilterRef = useRef({ nyu: false, columbia: false });

  const [mapLoaded, setMapLoaded] = useState(false);

  // Centered on NYC (all 5 boroughs)
  const [lng, setLng] = useState(-73.9731);
  const [lat, setLat] = useState(40.7113);
  const [zoom, setZoom] = useState(10.2);

  const [showInfo, setShowInfo] = useState(false);

  const [showBoroughColors, setShowBoroughColors] = useState(false);
  const [showParks, setShowParks] = useState(false);
  const [showCrime, setShowCrime] = useState(false);
  const [showGrocery, setShowGrocery] = useState(false);
  //groceries
  const [traderJoes, setTraderJoes] = useState(false);
  const [wholeFoods, setWholeFoods] = useState(false);

  const [showUniversity, setShowUniversity] = useState(false);
  //university (schools)
  const [nyu, setNyu] = useState(false);
  const [columbia, setColumbia] = useState(false);

  const [showSubway, setShowSubway] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [budgetMax, setBudgetMax] = useState(2750);
  const [showBikeshare, setShowBikeshare] = useState(false);

  const removeAllMarkers = (markerRef) => {
    markerRef.current.forEach((marker) => {
      marker.remove();
    });
    markerRef.current.length = 0; // Clear the ref array
  };

  const showMarkers = () => {
    if (!map.current) return;

    const traderjoes_res = require("../data/trader_joes_coordinates.geojson");
    const wholefoods_res = require("../data/whole_foods_coordinates.geojson");
    if (wholeFoods) {
      fetch(wholefoods_res)
        .then((r) => r.json())
        .then((data) => {
          removeAllMarkers(wholeFoodsMarkersRef);
          data.features.forEach((feature) => {
            const coordinates = feature.geometry.coordinates;
            const marker = new maplibregl.Marker({
              color: "#16a34a",
              scale: 0.65,
            })
              .setLngLat(coordinates)
              .addTo(map.current);
            wholeFoodsMarkersRef.current.push(marker);
          });
        })
        .catch((error) => {
          console.error(
            "There was an issue loading the Whole Foods data:",
            error
          );
        });
    } else {
      removeAllMarkers(wholeFoodsMarkersRef);
    }

    if (traderJoes) {
      fetch(traderjoes_res)
        .then((r) => r.json())
        .then((data) => {
          removeAllMarkers(traderJoesMarkersRef);
          data.features.forEach((feature) => {
            const coordinates = feature.geometry.coordinates;
            const marker = new maplibregl.Marker({
              color: "#dc2626",
              scale: 0.65,
            })
              .setLngLat(coordinates)
              .addTo(map.current);
            traderJoesMarkersRef.current.push(marker);
          });
        })
        .catch((error) => {
          console.error(
            "There was an issue loading the Trader Joe's data:",
            error
          );
        });
    } else {
      removeAllMarkers(traderJoesMarkersRef);
    }

    // University campus pins (single fixed location each, square badge
    // icons). Square badges are visually centered on their coordinate, so
    // anchor: "center" is used here instead of the "bottom" anchor a
    // teardrop pin would need.
    if (nyu) {
      if (nyuMarkerRef.current.length === 0) {
        const el = document.createElement("img");
        el.src = nyuPin;
        el.alt = "NYU";
        el.style.width = "36px";
        el.style.height = "36px";
        el.style.cursor = "pointer";
        el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
        el.style.borderRadius = "10px";
        const marker = new maplibregl.Marker({
          element: el,
          anchor: "center",
        })
          .setLngLat(NYU_COORDS)
          .addTo(map.current);
        nyuMarkerRef.current.push(marker);
      }
    } else {
      removeAllMarkers(nyuMarkerRef);
    }

    if (columbia) {
      if (columbiaMarkerRef.current.length === 0) {
        const el = document.createElement("img");
        el.src = columbiaPin;
        el.alt = "Columbia";
        el.style.width = "36px";
        el.style.height = "36px";
        el.style.cursor = "pointer";
        el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
        el.style.borderRadius = "10px";
        const marker = new maplibregl.Marker({
          element: el,
          anchor: "center",
        })
          .setLngLat(COLUMBIA_COORDS)
          .addTo(map.current);
        columbiaMarkerRef.current.push(marker);
      }
    } else {
      removeAllMarkers(columbiaMarkerRef);
    }
  };

  // Each *_score in the data runs 0-3, but the conventions are NOT
  // consistent: for some filters a high score means more desirable
  // (nyu/columbia = closest to campus, crime = safest, park = closest),
  // while for others a low score means more desirable (trader_joes,
  // whole_foods, subway, bikeshare = closest). To make shading mean one
  // thing everywhere -- darker = more desirable -- we convert every active
  // filter to a 0 (worst) .. 3 (best) "desirability" value, flipping the
  // ones whose raw convention is inverted, then average those, normalize
  // to 0-1, and map higher desirability -> higher opacity (darker). A
  // visibility floor keeps the weakest matches legible instead of fading
  // into the basemap.
  //
  // Filters where a HIGHER score already means more desirable:
  const HIGHER_IS_BETTER = new Set([
    "nyu_score",
    "columbia_score",
    "crime_score",
    "park_score",
  ]);
  // (trader_joes_score, whole_foods_score, subway_score, bikeshare_score
  //  are lower-is-better and get flipped below.)
  const MIN_OPACITY = 0.12;
  const SCORE_RANGE = 0.75;
  const BUDGET_PENALTY = 0.45;

  const updateOpacity = () => {
    if (!map.current) return;

    // Collect the active filters' score keys, then convert each to a
    // desirability value: 0 (worst) .. 3 (best). For higher-is-better
    // keys the raw score is already desirability; for the rest we flip it
    // with (3 - score).
    const activeScoreKeys = [];
    if (showParks) activeScoreKeys.push("park_score");
    if (showCrime) activeScoreKeys.push("crime_score");
    if (showBikeshare) activeScoreKeys.push("bikeshare_score");
    if (wholeFoods) activeScoreKeys.push("whole_foods_score");
    if (traderJoes) activeScoreKeys.push("trader_joes_score");
    if (nyu) activeScoreKeys.push("nyu_score");
    if (columbia) activeScoreKeys.push("columbia_score");
    if (showSubway) activeScoreKeys.push("subway_score");

    const desirabilityExprs = activeScoreKeys.map((key) =>
      HIGHER_IS_BETTER.has(key)
        ? ["get", key]
        : ["-", 3, ["get", key]]
    );

    let opacityExpression = 1;

    if (desirabilityExprs.length > 0) {
      const sumExpr = ["+", ...desirabilityExprs];
      const avgExpr =
        desirabilityExprs.length === 1
          ? sumExpr
          : ["/", sumExpr, desirabilityExprs.length];
      const normalizedExpr = ["/", avgExpr, 3]; // 0 (worst) - 1 (best)
      // More desirable -> darker: opacity grows with desirability.
      opacityExpression = [
        "+",
        ["-", 1, SCORE_RANGE],
        ["*", normalizedExpr, SCORE_RANGE],
      ];
    }

    if (showBudget) {
      opacityExpression = [
        "-",
        opacityExpression,
        [
          "case",
          [">=", ["get", "cost"], budgetMax],
          BUDGET_PENALTY,
          0, // default (no decrease)
        ],
      ];
    }

    // Clamp to [MIN_OPACITY, 1] so shading is always both visible and capped
    opacityExpression = ["max", MIN_OPACITY, ["min", 1, opacityExpression]];

    // Set the calculated opacity expression to the 'score-fill' layer
    map.current.setPaintProperty(
      "score-fill",
      "fill-opacity",
      opacityExpression
    );
  };

  useEffect(() => {
    const neighborhoods = require("../data/neighborhoods.geojson");
    const subwayLines = require("../data/subway_lines.geojson");
    const subwayStations = require("../data/subway_stations.geojson");

    //SETTING INITIAL MAP IN NYC
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [lng, lat],
      zoom: zoom,
      minZoom: 9.5,
    });

    //ADDING REGION FILLS AND OUTLINES

    map.current.on("load", () => {
      // Adding neighborhoods source
      map.current.addSource("neighborhoods", {
        type: "geojson",
        data: neighborhoods,
      });

      // Neighborhood fill layer NECESSARY FOR MOUSEMOVE
      map.current.addLayer({
        id: "neighborhood-fill",
        type: "fill",
        source: "neighborhoods",
        paint: {
          "fill-color": "transparent",
        },
      });

      // Neighborhood outline layer
      map.current.addLayer({
        id: "neighborhood-outline",
        type: "line",
        source: "neighborhoods",
        paint: {
          "line-color": "#64748b",
          "line-width": 1,
          "line-opacity": 0.55,
        },
      });

      // Score fill layer (using same neighborhoods source). Fill color is
      // fully opaque -- all shading contrast comes from the fill-opacity
      // expression in updateOpacity(), so it isn't pre-washed-out by a
      // baked-in alpha here.
      map.current.addLayer({
        id: "score-fill",
        type: "fill",
        source: "neighborhoods",
        paint: {
          "fill-color": "#1d4ed8",
        },
      });

      // Score outline layer (using same neighborhoods source) -- a crisp
      // white "grout line" between shaded neighborhoods.
      map.current.addLayer({
        id: "score-outline",
        type: "line",
        source: "neighborhoods",
        paint: {
          "line-color": "#ffffff",
          "line-width": 1,
          "line-opacity": 0.85,
        },
      });

      // SUBWAY LINES + STATIONS (toggled visible/invisible via the Subway
      // filter -- layout.visibility starts "none" and is flipped in the
      // second useEffect below, rather than adding/removing the layers
      // entirely, since these are static datasets with no per-filter score).
      map.current.addSource("subway-lines", {
        type: "geojson",
        data: subwayLines,
      });

      // Route geometries, colored per-route using each feature's own
      // "color" property (the official MTA bullet color, set when the
      // GeoJSON was built from the MTA Subway Service Lines dataset).
      map.current.addLayer({
        id: "subway-lines-casing",
        type: "line",
        source: "subway-lines",
        layout: { visibility: "none" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 4.5,
          "line-opacity": 0.9,
        },
      });
      map.current.addLayer({
        id: "subway-lines-layer",
        type: "line",
        source: "subway-lines",
        layout: { visibility: "none" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2.5,
          "line-opacity": 0.95,
        },
      });

      map.current.addSource("subway-stations", {
        type: "geojson",
        data: subwayStations,
      });

      // Station dots: small white-ringed circles, scaling up slightly on
      // zoom so they stay legible without overwhelming the map when zoomed
      // out across all 445 stations.
      map.current.addLayer({
        id: "subway-stations-layer",
        type: "circle",
        source: "subway-stations",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 15, 5.5],
          "circle-color": "#1f2937",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      // POPUP BASED ON NEIGHBORHOOD/BOROUGH
      const popupDiv = document.createElement("div");
      popupDiv.style.position = "absolute";
      popupDiv.style.backgroundColor = "#334155";
      popupDiv.style.color = "white";
      popupDiv.style.padding = "10px";
      popupDiv.style.borderRadius = "1px";
      popupDiv.style.pointerEvents = "none"; // Allow mouse events to pass through
      popupDiv.style.display = "none"; // Initially hidden
      document.body.appendChild(popupDiv);

      // Builds the popup HTML, appending an ETA line for each selected
      // school (NYU/Columbia) based on that neighborhood's precomputed
      // straight-line distance to campus.
      const buildPopupHTML = (boro, name, properties) => {
        const { nyu, columbia } = universityFilterRef.current;
        let etaLines = "";
        if (nyu) {
          const eta = estimateETA(properties.distance_from_nyu);
          if (eta != null) {
            etaLines += `<p style="color:#93c5fd; font-size:12px; margin-top:4px;">NYU ETA: ~${eta} min</p>`;
          }
        }
        if (columbia) {
          const eta = estimateETA(properties.distance_from_columbia);
          if (eta != null) {
            etaLines += `<p style="color:#93c5fd; font-size:12px; margin-top:2px;">Columbia ETA: ~${eta} min</p>`;
          }
        }
        return `

            <div>
            <h3 style="color:white; text-align:center; font-size:15px;">${boro}</h3>
            <p style="color: white; font-size: 13px; text-align:center;">${name}</p>
            ${etaLines}
          </div>
            `;
      };

      map.current.on(
        "mouseenter",
        ["neighborhood-fill", "score-fill"],
        (e) => {
          if (e.features.length > 1) {
            const { name } = e.features[0].properties;
            const { boro } = e.features[1].properties;

            if (name && boro) {
              popupDiv.innerHTML = buildPopupHTML(
                boro,
                name,
                e.features[0].properties
              );
              popupDiv.style.display = "block"; // Show the popup
            }
          }
        }
      );

      map.current.on(
        "mousemove",
        ["neighborhood-fill", "score-fill"],
        (e) => {
          if (e.features.length > 1) {
            const { name } = e.features[0].properties;
            const { boro } = e.features[1].properties;

            if (name && boro) {
              popupDiv.innerHTML = buildPopupHTML(
                boro,
                name,
                e.features[0].properties
              );
              popupDiv.style.display = "block"; // Show the popup
            }
          }
          // Update the position of the popup
          const x = e.originalEvent.clientX;
          const y = e.originalEvent.clientY;
          popupDiv.style.left = `${x}px`;
          popupDiv.style.top = `${y}px`;
          popupDiv.style.transform = "translate(-50%, -140%)";
        }
      );

      map.current.on(
        "mouseleave",
        ["neighborhood-fill", "score-fill"],
        () => {
          popupDiv.style.display = "none"; // Hide the popup
        }
      );

      // STATION CLICK POPUP: shows the station name and a colored bullet
      // for each line it serves (MTA_ROUTE_COLORS, defined above the
      // component, since the GeoJSON source loads asynchronously).
      map.current.on("click", "subway-stations-layer", (e) => {
        const { name, routes } = e.features[0].properties;
        const routeList =
          typeof routes === "string" ? JSON.parse(routes) : routes;

        const bullets = routeList
          .map((r) => {
            const color = MTA_ROUTE_COLORS[r] || "#808183";
            return `<span style="display:inline-flex; align-items:center; justify-content:center;
                width:20px; height:20px; border-radius:50%; background:${color};
                color:white; font-size:11px; font-weight:600; margin:2px;">${r}</span>`;
          })
          .join("");

        new maplibregl.Popup({ closeButton: true, offset: 10 })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="min-width:140px;">
              <p style="font-weight:600; font-size:13px; margin-bottom:4px;">${name}</p>
              <div style="display:flex; flex-wrap:wrap;">${bullets}</div>
            </div>`
          )
          .addTo(map.current);
      });

      map.current.on("mouseenter", "subway-stations-layer", () => {
        map.current.getCanvas().style.cursor = "pointer";
      });
      map.current.on("mouseleave", "subway-stations-layer", () => {
        map.current.getCanvas().style.cursor = "";
      });

      //UPDATE ZOOM AND CENTER OF MAP BASED ON DRAG
      map.current.on("move", () => {
        setZoom(map.current.getZoom().toFixed(2));
      });

      map.current.on("drag", () => {
        const center = map.current.getCenter();
        const newLng = Math.max(-74.27, Math.min(-73.68, center.lng));
        const newLat = Math.max(40.49, Math.min(40.93, center.lat));

        if (center.lng !== newLng || center.lat !== newLat) {
          map.current.setCenter(new maplibregl.LngLat(newLng, newLat));
        }
      });
    });

    setMapLoaded(true);
  }, []);

  //SECOND USE EFFECT TO UPDATE THINGS WITHOUT RERENDER

  useEffect(() => {
    universityFilterRef.current = { nyu, columbia };

    if (map.current && map.current.isStyleLoaded() && mapLoaded) {
      updateOpacity();
      showMarkers();

      // Subway lines + station dots are static datasets (no proximity
      // score), so rather than adding/removing layers we just flip their
      // visibility with the Subway filter toggle.
      const subwayVisibility = showSubway ? "visible" : "none";
      map.current.setLayoutProperty(
        "subway-lines-casing",
        "visibility",
        subwayVisibility
      );
      map.current.setLayoutProperty(
        "subway-lines-layer",
        "visibility",
        subwayVisibility
      );
      map.current.setLayoutProperty(
        "subway-stations-layer",
        "visibility",
        subwayVisibility
      );

      map.current.setPaintProperty(
        "score-fill",
        "fill-color",
        showBoroughColors
          ? [
              "match",
              ["get", "boro"],
              "Manhattan",
              "#1d4ed8", // blue
              "Brooklyn",
              "#ea580c", // orange
              "Queens",
              "#16a34a", // green
              "Bronx",
              "#dc2626", // red
              "Staten Island",
              "#9333ea", // purple
              "#1d4ed8", // Default value if no match
            ]
          : "#1d4ed8" // static fill color; fill-opacity carries the shading
      );
    }
  }, [
    showBoroughColors,
    showParks,
    showCrime,
    showBikeshare,
    wholeFoods,
    traderJoes,
    nyu,
    columbia,
    showSubway,
    showBudget,
    budgetMax,
    map.current,
  ]);

  const handleZoomIn = () => {
    map.current.zoomTo(map.current.getZoom() + 1, { duration: 200 });
  };

  const handleZoomOut = () => {
    map.current.zoomTo(map.current.getZoom() - 1, { duration: 200 });
  };

  return (
    <>
      <div
        className={`${
          showInfo ? " opacity-50" : "opacity-100"
        }  bg-white relative h-screen w-screen overflow-hidden`}
        onClick={() => setShowInfo(false)}
      >
        {/* FLOATING SIDEBAR */}
        <div
          className="absolute z-20 xl:top-4 xl:left-4 xl:bottom-4 top-2 left-2 bottom-2
              xl:w-[26%] w-[58%] max-w-sm rounded-2xl shadow-2xl ring-1 ring-black/5
              overflow-y-auto bg-gray-50/95 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{ width: "100%" }}
            className="bg-white/90 backdrop-blur-sm border-b border-gray-200 rounded-t-2xl sticky top-0 z-10 xl:p-4 p-2 flex items-center gap-2"
          >
            <img
              src={logo}
              alt="logo"
              className="2xl:w-9 2xl:h-9 xl:w-8 xl:h-8 lg:w-7 lg:h-7 md:w-6 md:h-6 w-5 h-5"
            />
            <h1 className="font-semibold text-indigo-700 font-mono title">
              Proximity
            </h1>
            <button
              type="button"
              className="ml-auto flex items-center justify-center rounded-full
                  text-gray-400 border border-gray-300 xl:h-6 xl:w-6 w-5 h-5 font-semibold
                  hover:text-white hover:bg-indigo-600 hover:border-indigo-600 duration-200 cursor-pointer
                  font-serif lg:text-xs text-xxs"
              onClick={(e) => {
                e.stopPropagation();
                setShowInfo(true);
              }}
            >
              i
            </button>
          </div>
          <div className="flex flex-col xl:py-4 xl:px-3 py-2 px-2 rounded-b-2xl">
            <h1 className=" text-gray-900 font-semibold subTitle">
              Add More Filters
            </h1>
            <h3 className="mb-2 text-gray-500 subTitle2">
              Continue refining your ideal neighborhoods
            </h3>
            <div className="flex flex-col gap-1.5 pb-4 mb-3 border-b border-gray-200 bodyText">
              <div
                onClick={() => setShowUniversity(true)}
                className={`flex items-center gap-2 w-full xl:py-2 xl:px-2.5 py-1.5 px-2 rounded-xl border transition-all duration-200 ${
                  showUniversity
                    ? "bg-violet-50 border-violet-200 cursor-not-allowed"
                    : "bg-white border-gray-200 hover:border-violet-300 hover:shadow-sm cursor-pointer"
                }`}
              >
                <span className="flex items-center justify-center shrink-0 rounded-full bg-violet-600 text-white xl:w-7 xl:h-7 w-5 h-5">
                  <FaUniversity className="xl:w-3.5 xl:h-3.5 w-2.5 h-2.5" />
                </span>
                <span className="font-medium text-gray-800">University</span>
                {showUniversity && (
                  <BsCheckCircleFill className="ml-auto text-violet-500 xl:w-4 xl:h-4 w-3 h-3" />
                )}
              </div>
              <div
                onClick={() => setShowCrime(true)}
                className={`flex items-center gap-2 w-full xl:py-2 xl:px-2.5 py-1.5 px-2 rounded-xl border transition-all duration-200 ${
                  showCrime
                    ? "bg-rose-50 border-rose-200 cursor-not-allowed"
                    : "bg-white border-gray-200 hover:border-rose-300 hover:shadow-sm cursor-pointer"
                }`}
              >
                <span className="flex items-center justify-center shrink-0 rounded-full bg-rose-600 text-white xl:w-7 xl:h-7 w-5 h-5">
                  <BsShield className="xl:w-3.5 xl:h-3.5 w-2.5 h-2.5" />
                </span>
                <span className="font-medium text-gray-800">Safety</span>
                {showCrime && (
                  <BsCheckCircleFill className="ml-auto text-rose-500 xl:w-4 xl:h-4 w-3 h-3" />
                )}
              </div>
              <div
                onClick={() => setShowParks(true)}
                className={`flex items-center gap-2 w-full xl:py-2 xl:px-2.5 py-1.5 px-2 rounded-xl border transition-all duration-200 ${
                  showParks
                    ? "bg-emerald-50 border-emerald-200 cursor-not-allowed"
                    : "bg-white border-gray-200 hover:border-emerald-300 hover:shadow-sm cursor-pointer"
                }`}
              >
                <span className="flex items-center justify-center shrink-0 rounded-full bg-emerald-600 text-white xl:w-7 xl:h-7 w-5 h-5">
                  <BsTree className="xl:w-3.5 xl:h-3.5 w-2.5 h-2.5" />
                </span>
                <span className="font-medium text-gray-800">Parks</span>
                {showParks && (
                  <BsCheckCircleFill className="ml-auto text-emerald-500 xl:w-4 xl:h-4 w-3 h-3" />
                )}
              </div>
              <div
                onClick={() => setShowGrocery(true)}
                className={`flex items-center gap-2 w-full xl:py-2 xl:px-2.5 py-1.5 px-2 rounded-xl border transition-all duration-200 ${
                  showGrocery
                    ? "bg-orange-50 border-orange-200 cursor-not-allowed"
                    : "bg-white border-gray-200 hover:border-orange-300 hover:shadow-sm cursor-pointer"
                }`}
              >
                <span className="flex items-center justify-center shrink-0 rounded-full bg-orange-600 text-white xl:w-7 xl:h-7 w-5 h-5">
                  <FiShoppingCart className="xl:w-3.5 xl:h-3.5 w-2.5 h-2.5" />
                </span>
                <span className="font-medium text-gray-800">Grocery Chains</span>
                {showGrocery && (
                  <BsCheckCircleFill className="ml-auto text-orange-500 xl:w-4 xl:h-4 w-3 h-3" />
                )}
              </div>
              <div
                onClick={() => setShowSubway(true)}
                className={`flex items-center gap-2 w-full xl:py-2 xl:px-2.5 py-1.5 px-2 rounded-xl border transition-all duration-200 ${
                  showSubway
                    ? "bg-blue-50 border-blue-200 cursor-not-allowed"
                    : "bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm cursor-pointer"
                }`}
              >
                <span className="flex items-center justify-center shrink-0 rounded-full bg-blue-600 text-white xl:w-7 xl:h-7 w-5 h-5">
                  <BsTrainFront className="xl:w-3.5 xl:h-3.5 w-2.5 h-2.5" />
                </span>
                <span className="font-medium text-gray-800">Subway Stations</span>
                {showSubway && (
                  <BsCheckCircleFill className="ml-auto text-blue-500 xl:w-4 xl:h-4 w-3 h-3" />
                )}
              </div>
              <div
                onClick={() => setShowBudget(true)}
                className={`flex items-center gap-2 w-full xl:py-2 xl:px-2.5 py-1.5 px-2 rounded-xl border transition-all duration-200 ${
                  showBudget
                    ? "bg-amber-50 border-amber-200 cursor-not-allowed"
                    : "bg-white border-gray-200 hover:border-amber-300 hover:shadow-sm cursor-pointer"
                }`}
              >
                <span className="flex items-center justify-center shrink-0 rounded-full bg-amber-500 text-white xl:w-7 xl:h-7 w-5 h-5">
                  <BiMoneyWithdraw className="xl:w-3.5 xl:h-3.5 w-2.5 h-2.5" />
                </span>
                <span className="font-medium text-gray-800">Budget</span>
                {showBudget && (
                  <BsCheckCircleFill className="ml-auto text-amber-500 xl:w-4 xl:h-4 w-3 h-3" />
                )}
              </div>
              <div
                onClick={() => setShowBikeshare(true)}
                className={`flex items-center gap-2 w-full xl:py-2 xl:px-2.5 py-1.5 px-2 rounded-xl border transition-all duration-200 ${
                  showBikeshare
                    ? "bg-slate-100 border-slate-300 cursor-not-allowed"
                    : "bg-white border-gray-200 hover:border-slate-300 hover:shadow-sm cursor-pointer"
                }`}
              >
                <span className="flex items-center justify-center shrink-0 rounded-full bg-slate-500 text-white xl:w-7 xl:h-7 w-5 h-5">
                  <PiPersonSimpleBikeBold className="xl:w-3.5 xl:h-3.5 w-2.5 h-2.5" />
                </span>
                <span className="font-medium text-gray-800">BikeShare</span>
                {showBikeshare && (
                  <BsCheckCircleFill className="ml-auto text-slate-500 xl:w-4 xl:h-4 w-3 h-3" />
                )}
              </div>
            </div>

            <div className="flex flex-col pb-4">
              <h1 className=" text-gray-900 font-semibold subTitle">
                Active Filters
              </h1>
              <h2 className="text-gray-500 subTitle2 mb-1">
                Click a filter to remove it
              </h2>
              <div>{displayActiveFilters()}</div>
            </div>
          </div>
        </div>

        <div className="absolute inset-0 h-screen w-screen">
          <div className="absolute top-2 right-2 z-10 flex flex-col">
            <button
              className="text-xl font-extrabold text-black rounded-t-xl border-2 shadow-2xl  bg-white hover:bg-gray-200 duration-200 p-1 w-9 h-10"
              onClick={handleZoomIn}
            >
              +
            </button>
            <button
              className="text-xl font-extrabold text-black rounded-b-xl border-2 border-t-0 shadow-2xl bg-white hover:bg-gray-200 duration-200 p-1 w-9 h-10"
              onClick={handleZoomOut}
            >
              -
            </button>
          </div>

          <div className="absolute bottom-8 right-2 z-10 flex flex-col">
            <button
              className="xl:text-md md:text-sm text-xs font-semibold text-black rounded-md lg:border-2 border-1  bg-white hover:bg-gray-200 duration-200 p-1 w-full"
              onClick={() => {
                setShowBoroughColors(!showBoroughColors);
              }}
            >
              {showBoroughColors
                ? "Hide Borough Colors"
                : "Show Borough Colors"}
            </button>
          </div>

          <div ref={mapContainer} className="top-0 h-full w-full" />
        </div>
      </div>
      {showInfo ? (
        <div className="absolute opacity-100 left-0 right-0 mx-auto about-container">
          <div class="lg:text-sm text-xs bg-white pb-16  md:px-8 px-4 rounded-md">
            <h1 className="lg:text-3xl sm:text-xl text-xl font-semibold text-center py-6">
              About
            </h1>
            <div class="lg:text-lg text-sm mb-1">
              <b>How does Proximity work?</b>
            </div>
            Proximity helps you discover suitable neighborhoods in New York
            City, based on your preferences -- including how close you want
            to live to a university like NYU or Columbia.
            <ul class="list-decimal ml-6 text-sm">
              <li class="mt-1">
                <b>Adding Filters</b>: From the left sidebar, add filters to
                narrow down your search. You can also click on some filters to
                fine-tune your preferences.
              </li>
              <li class="mt-1">
                <b>View Map</b>: The map is interactive and will update as you
                add filters. Darker areas are the better matches for your
                preferences -- for example, the neighborhoods closest to your
                chosen university or with the highest safety appear darkest.
                You can hover over a neighborhood to see its name and borough.
              </li>
              <li class="mt-1">
                <b>See Boroughs</b>: On the bottom right, toggle "Show
                Borough Colors" to color-coordinate the map by each
                neighborhood's borough.
              </li>
            </ul>
            <div class="lg:text-lg mt-4 mb-1">
              <b>Where do you get the data?</b>
            </div>
            We source our data from several public datasets, and apply
            additional processing to aggregate the disparate datasets into a
            convenient and accessible format.
            <ul class="ml-6 list-disc">
              <li class="mt-1">
                <b>Neighborhoods and Boroughs</b>: 2020 Neighborhood
                Tabulation Areas (NTA),{" "}
                <a
                  href="https://data.cityofnewyork.us"
                  target="_blank"
                  rel="noreferrer"
                  class="text-blue-500 underline"
                >
                  NYC Open Data
                </a>
              </li>
              <li class="mt-1">
                <b>University (NYU &amp; Columbia)</b>: campus locations geocoded
                from each university's published addresses
              </li>
              <li class="mt-1">
                <b>Grocery Chains</b>: Trader Joe's and Whole Foods store
                locator listings
              </li>
              <li class="mt-1">
                <b>Parks</b>:{" "}
                <a
                  href="https://data.cityofnewyork.us"
                  target="_blank"
                  rel="noreferrer"
                  class="text-blue-500 underline"
                >
                  NYC Open Data
                </a>{" "}
                (NYC Parks Properties)
              </li>
              <li class="mt-1">
                <b>BikeShare</b>:{" "}
                <a
                  href="https://citibikenyc.com/system-data"
                  target="_blank"
                  rel="noreferrer"
                  class="text-blue-500 underline"
                >
                  Citi Bike GBFS feed
                </a>
              </li>
              <li class="mt-1">
                <b>Subway Stations &amp; Lines</b>:{" "}
                <a
                  href="https://data.ny.gov"
                  target="_blank"
                  rel="noreferrer"
                  class="text-blue-500 underline"
                >
                  MTA Subway Stations and Subway Service Lines, Open Data NY
                </a>
              </li>
              <li class="mt-1">
                <b>Safety</b>:{" "}
                <a
                  href="https://data.cityofnewyork.us"
                  target="_blank"
                  rel="noreferrer"
                  class="text-blue-500 underline"
                >
                  NYPD Complaint Data, NYC Open Data
                </a>
              </li>
              <li class="mt-1">
                <b>Housing Prices</b>:{" "}
                <a
                  href="https://www.huduser.gov/portal/datasets/fmr/smallarea/index.html"
                  target="_blank"
                  rel="noreferrer"
                  class="text-blue-500 underline"
                >
                  HUD Small Area Fair Market Rents
                </a>{" "}
                (1BR, calculated by ZIP code)
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <></>
      )}
    </>
  );

  function displayActiveFilters() {
    return (
      <div className="flex flex-col gap-2 bodyText">
        {showUniversity ? (
          <div
            onClick={() => {
              setShowUniversity(false);
              setNyu(false);
              setColumbia(false);
            }}
            className={`group rounded-xl border border-gray-200 border-l-4 border-l-violet-500 bg-white hover:bg-gray-50 hover:shadow-sm w-full p-2 flex flex-col duration-200 cursor-pointer`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-gray-800">
                <FaUniversity className="xl:w-4 xl:h-4 w-2.5 h-2.5 text-violet-500" />
                University
              </span>
              <span className="text-gray-300 group-hover:text-gray-500">
                &times;
              </span>
            </div>
            <div className="grid grid-cols-2 lg:gap-2 gap-1 mt-1.5">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setNyu(!nyu);
                }}
                className={`${
                  nyu
                    ? "bg-violet-600 border-violet-600 text-white"
                    : "bg-white border-gray-300 text-gray-700"
                } duration-150 text-center border rounded-lg xl:px-2 px-0.5 py-1 cursor-pointer bodyText2`}
              >
                NYU
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setColumbia(!columbia);
                }}
                className={`${
                  columbia
                    ? "bg-violet-600 border-violet-600 text-white"
                    : "bg-white border-gray-300 text-gray-700"
                } duration-150 text-center border rounded-lg xl:px-2 px-0.5 py-1 cursor-pointer bodyText2`}
              >
                Columbia
              </div>
            </div>
          </div>
        ) : (
          <></>
        )}
        {showCrime ? (
          <div
            onClick={() => setShowCrime(false)}
            className={`group rounded-xl border border-gray-200 border-l-4 border-l-rose-500 bg-white hover:bg-gray-50 hover:shadow-sm w-full p-2 flex items-center justify-between duration-200 cursor-pointer`}
          >
            <span className="flex items-center gap-1.5 font-medium text-gray-800">
              <BsShield className="xl:w-4 xl:h-4 w-2.5 h-2.5 text-rose-500" />
              Safety
            </span>
            <span className="text-gray-300 group-hover:text-gray-500">
              &times;
            </span>
          </div>
        ) : (
          <></>
        )}
        {showParks ? (
          <div
            onClick={() => setShowParks(false)}
            className={`group rounded-xl border border-gray-200 border-l-4 border-l-emerald-500 bg-white hover:bg-gray-50 hover:shadow-sm w-full p-2 flex items-center justify-between duration-200 cursor-pointer`}
          >
            <span className="flex items-center gap-1.5 font-medium text-gray-800">
              <BsTree className="xl:w-4 xl:h-4 w-2.5 h-2.5 text-emerald-500" />
              Parks
            </span>
            <span className="text-gray-300 group-hover:text-gray-500">
              &times;
            </span>
          </div>
        ) : (
          <></>
        )}
        {showGrocery ? (
          <div
            onClick={() => {
              setShowGrocery(false);
              setWholeFoods(false);
              setTraderJoes(false);
            }}
            className={`group rounded-xl border border-gray-200 border-l-4 border-l-orange-500 bg-white hover:bg-gray-50 hover:shadow-sm w-full p-2 flex flex-col duration-200 cursor-pointer`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-gray-800">
                <FiShoppingCart className="xl:w-4 xl:h-4 w-2.5 h-2.5 text-orange-500" />
                Grocery Chains
              </span>
              <span className="text-gray-300 group-hover:text-gray-500">
                &times;
              </span>
            </div>
            <div className="grid grid-cols-2 lg:gap-2 gap-1 mt-1.5">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setTraderJoes(!traderJoes);
                }}
                className={`${
                  traderJoes
                    ? "bg-orange-600 border-orange-600 text-white"
                    : "bg-white border-gray-300 text-gray-700"
                } duration-150 text-center border rounded-lg xl:px-2 px-0.5 py-1 cursor-pointer bodyText2`}
              >
                Trader Joe's
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setWholeFoods(!wholeFoods);
                }}
                className={`${
                  wholeFoods
                    ? "bg-orange-600 border-orange-600 text-white"
                    : "bg-white border-gray-300 text-gray-700"
                } duration-150 text-center border rounded-lg xl:px-2 px-0.5 py-1 cursor-pointer bodyText2`}
              >
                Whole Foods
              </div>
            </div>
          </div>
        ) : (
          <></>
        )}
        {showSubway ? (
          <div
            onClick={() => setShowSubway(false)}
            className={`group rounded-xl border border-gray-200 border-l-4 border-l-blue-500 bg-white hover:bg-gray-50 hover:shadow-sm w-full p-2 flex items-center justify-between duration-200 cursor-pointer`}
          >
            <span className="flex items-center gap-1.5 font-medium text-gray-800">
              <BsTrainFront className="xl:w-4 xl:h-4 w-2.5 h-2.5 text-blue-500" />
              Subway Stations
            </span>
            <span className="text-gray-300 group-hover:text-gray-500">
              &times;
            </span>
          </div>
        ) : (
          <></>
        )}
        {showBudget ? (
          <div
            onClick={() => setShowBudget(false)}
            className={`group rounded-xl border border-gray-200 border-l-4 border-l-amber-500 bg-white hover:bg-gray-50 hover:shadow-sm w-full p-2 flex flex-col duration-200 cursor-pointer`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-gray-800">
                <BiMoneyWithdraw className="xl:w-4 xl:h-4 w-2.5 h-2.5 text-amber-500" />
                Budget
              </span>
              <span className="text-gray-300 group-hover:text-gray-500">
                &times;
              </span>
            </div>
            <div
              onClick={(e) => {
                e.stopPropagation();
              }}
              className={`bodyText2 mt-1.5`}
            >
              <div class="slidecontainer">
                <p>Max Monthly Rent (1BR):</p>
                <input
                  onChange={(e) => {
                    setBudgetMax(parseInt(e.target.value));
                  }}
                  type="range"
                  min="2000"
                  max="4000"
                  step="50"
                  value={budgetMax}
                  class="slider"
                  id="myRange"
                />
                <div className="flex flex-col py-2 px-2 bg-amber-50 rounded-lg w-full mx-auto border border-amber-200">
                  <p className="">Max 1BR Rent: </p>
                  <span className="font-semibold">${budgetMax}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <></>
        )}
        {showBikeshare ? (
          <div
            onClick={() => setShowBikeshare(false)}
            className={`group rounded-xl border border-gray-200 border-l-4 border-l-slate-500 bg-white hover:bg-gray-50 hover:shadow-sm w-full p-2 flex items-center justify-between duration-200 cursor-pointer`}
          >
            <span className="flex items-center gap-1.5 font-medium text-gray-800">
              <PiPersonSimpleBikeBold className="xl:w-4 xl:h-4 w-2.5 h-2.5 text-slate-500" />
              BikeShare
            </span>
            <span className="text-gray-300 group-hover:text-gray-500">
              &times;
            </span>
          </div>
        ) : (
          <></>
        )}
      </div>
    );
  }
};

export default Home;
