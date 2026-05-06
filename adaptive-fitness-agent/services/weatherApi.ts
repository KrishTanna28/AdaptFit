import {
  inferWeatherCondition,
  type LifestyleWeatherSnapshot,
} from "./lifestyleLog";

type OpenMeteoGeocodeResponse = {
  results?: Array<{
    name?: string;
    admin1?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  }>;
};

type OpenMeteoForecastResponse = {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
  };
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatPlaceName(place: NonNullable<OpenMeteoGeocodeResponse["results"]>[number]) {
  return [safeText(place.name), safeText(place.admin1), safeText(place.country)]
    .filter(Boolean)
    .join(", ");
}

export async function fetchWeatherForLocation(query: string): Promise<LifestyleWeatherSnapshot> {
  const locationQuery = query.trim();
  if (locationQuery.length < 2) {
    throw new Error("Enter a city or location first.");
  }

  const geocodeUrl =
    "https://geocoding-api.open-meteo.com/v1/search" +
    "?count=1&language=en&format=json&name=" +
    encodeURIComponent(locationQuery);

  const geocodeResponse = await fetch(geocodeUrl);
  if (!geocodeResponse.ok) {
    throw new Error("Weather location lookup failed.");
  }

  const geocode = (await geocodeResponse.json()) as OpenMeteoGeocodeResponse;
  const place = Array.isArray(geocode.results) ? geocode.results[0] : null;

  if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") {
    throw new Error("No weather match found for that location.");
  }

  const forecastUrl =
    "https://api.open-meteo.com/v1/forecast" +
    "?current=temperature_2m,relative_humidity_2m" +
    "&timezone=auto" +
    "&latitude=" +
    encodeURIComponent(String(place.latitude)) +
    "&longitude=" +
    encodeURIComponent(String(place.longitude));

  const forecastResponse = await fetch(forecastUrl);
  if (!forecastResponse.ok) {
    throw new Error("Current weather lookup failed.");
  }

  const forecast = (await forecastResponse.json()) as OpenMeteoForecastResponse;
  const temperatureC =
    typeof forecast.current?.temperature_2m === "number"
      ? forecast.current.temperature_2m
      : null;
  const humidityPercent =
    typeof forecast.current?.relative_humidity_2m === "number"
      ? forecast.current.relative_humidity_2m
      : null;

  return {
    locationName: formatPlaceName(place) || locationQuery,
    temperatureC,
    humidityPercent,
    condition: inferWeatherCondition({ temperatureC, humidityPercent }),
    fetchedAt: new Date().toISOString(),
  };
}
