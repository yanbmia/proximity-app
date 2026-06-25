# Proximity

A website designed to help people find the perfect neighborhood in New York
City, built around proximity to universities (NYU and Columbia),
alongside safety, parks, grocery chains, subway access, rent, and bikeshare
coverage.


## Table of Contents

- [General Info](#general-information)
- [Technologies Used](#technologies-used)
- [Features](#features)
- [Data Sources](#data-sources)
- [Environment Setup](#environment-setup)
- [Usage](#usage)
- [Room for Improvement](#room-for-improvement)

## General Information

Proximity shades a map of NYC's neighborhoods (2020 Neighborhood Tabulation
Areas) based on how well each one matches the filters you select. Darker
shading means a stronger match. Filters stack, so the more you add, the more
each neighborhood's shading reflects your combined preferences.

## Technologies Used

- NodeJS and npm
- React 18.2.0
- React-Router-Dom 6.14.1
- MapLibre GL JS (with free OpenFreeMap basemap tiles, no API key required)
- Python (data processing / scoring scripts, see `scripts/`)

## Features

- **University**: shade by proximity to NYU and/or Columbia (toggle either or
  both); hover a neighborhood to see an estimated travel-time ETA to each
  selected school
- **Safety**: shade by reported crime volume per neighborhood
- **Parks**: shade by proximity to NYC parks
- **Grocery Chains**: shade by proximity to Trader Joe's and/or Whole Foods,
  with map pins for each store location
- **Subway Stations**: shade by proximity to the nearest subway station, and
  draw every NYC subway/SIR line on the map color-coded by route, with a
  dot for each station -- click a station to see which lines stop there
- **Budget**: dim neighborhoods above your max monthly 1BR rent
- **BikeShare**: shade by proximity to Citi Bike stations
- **Show Borough Colors**: color-code neighborhoods by borough (Manhattan,
  Brooklyn, Queens, Bronx, Staten Island)

## Data Sources

- **Neighborhoods & Boroughs**: 2020 Neighborhood Tabulation Areas (NTA), NYC
  Open Data
- **University (NYU & Columbia)**: campus locations geocoded from each
  university's published addresses
- **Safety**: NYPD Complaint Data, NYC Open Data
- **Parks**: NYC Parks Properties, NYC Open Data
- **Grocery Chains**: Trader Joe's and Whole Foods store locator listings
- **Subway Stations & Lines**: MTA Subway Stations and MTA Subway Service
  Lines datasets, Open Data NY
- **Budget**: HUD Small Area Fair Market Rents (1BR, by ZIP code)
- **BikeShare**: Citi Bike GBFS feed

All raw data and the scripts used to turn it into neighborhood-level scores
live in `raw/` and `scripts/`.

## Environment Setup

### Install NodeJS

Verify you're running a recent version of Node:

```sh
node -v
```

### Application Install

No API key or `.env` file is needed -- the map runs on MapLibre GL JS with
[OpenFreeMap](https://openfreemap.org) tiles, which are free and require no
registration.

Install and run:

```sh
npm install
npm start
```

## Usage

1. **Select Filters**: Click on filters in the left sidebar to shade
   neighborhoods by your preferences. Click a filter chip again to remove it.
   Some filters (University, Grocery Chains) have sub-toggles -- e.g. choose
   NYU, Columbia, or both under University. Once a school is selected,
   hovering a neighborhood shows its estimated ETA to that campus.
2. **Explore the Map**: Zoom with the +/- controls, drag to pan, and hover
   over a neighborhood to see its name and borough. With Subway Stations
   enabled, every line is drawn in its official MTA color and each station
   is clickable to see which lines serve it.
3. **Show Borough Colors**: Toggle this in the bottom right to color-code
   neighborhoods by borough instead.
4. **About**: Click the "i" icon next to "Proximity" to see how the app works
   and where the data comes from.

## Project Status

- Project is: _in progress_.
