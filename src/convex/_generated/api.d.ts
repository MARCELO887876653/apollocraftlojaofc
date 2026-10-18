/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeys from "../apiKeys.js";
import type * as apiKeysV1 from "../apiKeysV1.js";
import type * as apiV1 from "../apiV1.js";
import type * as apiV1Catalog from "../apiV1Catalog.js";
import type * as apiV1Data from "../apiV1Data.js";
import type * as apiV1Files from "../apiV1Files.js";
import type * as apiV1Probe from "../apiV1Probe.js";
import type * as apiV1Sync from "../apiV1Sync.js";
import type * as auth from "../auth.js";
import type * as auth_discord from "../auth/discord.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as categories from "../categories.js";
import type * as content from "../content.js";
import type * as coupons from "../coupons.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as deliveries from "../deliveries.js";
import type * as deliveriesAdmin from "../deliveriesAdmin.js";
import type * as deliveriesQueue from "../deliveriesQueue.js";
import type * as deliveryCommands from "../deliveryCommands.js";
import type * as discordAuth from "../discordAuth.js";
import type * as externalApi from "../externalApi.js";
import type * as externalApiData from "../externalApiData.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_apiEndpoint from "../lib/apiEndpoint.js";
import type * as lib_apiSchema from "../lib/apiSchema.js";
import type * as lib_catalog from "../lib/catalog.js";
import type * as lib_data from "../lib/data.js";
import type * as lib_defaultPages from "../lib/defaultPages.js";
import type * as lib_deliveryLog from "../lib/deliveryLog.js";
import type * as lib_deliveryRecipe from "../lib/deliveryRecipe.js";
import type * as lib_discord from "../lib/discord.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_seo from "../lib/seo.js";
import type * as lib_storefrontData from "../lib/storefrontData.js";
import type * as logs from "../logs.js";
import type * as maintenance from "../maintenance.js";
import type * as maintenanceEmails from "../maintenanceEmails.js";
import type * as orders from "../orders.js";
import type * as payments from "../payments.js";
import type * as paymentsData from "../paymentsData.js";
import type * as products from "../products.js";
import type * as profile from "../profile.js";
import type * as settings from "../settings.js";
import type * as stats from "../stats.js";
import type * as storefront from "../storefront.js";
import type * as team from "../team.js";
import type * as users from "../users.js";
import type * as webhooksOut from "../webhooksOut.js";
import type * as webhooksOutData from "../webhooksOutData.js";
import type * as webhooksTest from "../webhooksTest.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  apiKeysV1: typeof apiKeysV1;
  apiV1: typeof apiV1;
  apiV1Catalog: typeof apiV1Catalog;
  apiV1Data: typeof apiV1Data;
  apiV1Files: typeof apiV1Files;
  apiV1Probe: typeof apiV1Probe;
  apiV1Sync: typeof apiV1Sync;
  auth: typeof auth;
  "auth/discord": typeof auth_discord;
  "auth/emailOtp": typeof auth_emailOtp;
  categories: typeof categories;
  content: typeof content;
  coupons: typeof coupons;
  crons: typeof crons;
  customers: typeof customers;
  deliveries: typeof deliveries;
  deliveriesAdmin: typeof deliveriesAdmin;
  deliveriesQueue: typeof deliveriesQueue;
  deliveryCommands: typeof deliveryCommands;
  discordAuth: typeof discordAuth;
  externalApi: typeof externalApi;
  externalApiData: typeof externalApiData;
  files: typeof files;
  http: typeof http;
  integrations: typeof integrations;
  "lib/admin": typeof lib_admin;
  "lib/apiEndpoint": typeof lib_apiEndpoint;
  "lib/apiSchema": typeof lib_apiSchema;
  "lib/catalog": typeof lib_catalog;
  "lib/data": typeof lib_data;
  "lib/defaultPages": typeof lib_defaultPages;
  "lib/deliveryLog": typeof lib_deliveryLog;
  "lib/deliveryRecipe": typeof lib_deliveryRecipe;
  "lib/discord": typeof lib_discord;
  "lib/hash": typeof lib_hash;
  "lib/seo": typeof lib_seo;
  "lib/storefrontData": typeof lib_storefrontData;
  logs: typeof logs;
  maintenance: typeof maintenance;
  maintenanceEmails: typeof maintenanceEmails;
  orders: typeof orders;
  payments: typeof payments;
  paymentsData: typeof paymentsData;
  products: typeof products;
  profile: typeof profile;
  settings: typeof settings;
  stats: typeof stats;
  storefront: typeof storefront;
  team: typeof team;
  users: typeof users;
  webhooksOut: typeof webhooksOut;
  webhooksOutData: typeof webhooksOutData;
  webhooksTest: typeof webhooksTest;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
