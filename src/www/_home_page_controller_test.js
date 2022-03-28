// Copyright Titanium I.T. LLC.
"use strict";

const assert = require("util/assert");
const ensure = require("util/ensure");
const HttpRequest = require("http/http_request");
const WwwConfig = require("./www_config");
const wwwView = require("./www_view");
const Rot13Client = require("./infrastructure/rot13_client");
const HomePageController = require("./home_page_controller");
const Log = require("infrastructure/log");

const IRRELEVANT_PORT = 42;
const PARSE_LOG_BOILERPLATE = {
	alert: Log.MONITOR,
	message: "form parse error in POST /",
};

describe("Home Page Controller", () => {

	describe("happy paths", () => {

		it("GET renders home page", async () => {
			const { response } = await simulateGetAsync();
			assert.deepEqual(response, wwwView.homePage());
		});

		it("POST asks ROT-13 service to transform text, then renders result", async () => {
			const rot13Client = Rot13Client.createNull([{ response: "my_response" }]);
			const { response, rot13Requests } =
				await simulatePostAsync({ body: "text=my_text", rot13Client, rot13Port: 9999 });

			assert.deepEqual(rot13Requests, [{
				port: 9999,       // should match config
				text: "my_text",  // should match post body
			}], "ROT-13 service request");
			assert.deepEqual(response, wwwView.homePage("my_response"), "home page rendering");
		});

	});


	describe("parse edge cases", () => {

		it("finds correct form field when there are unrelated fields", async () => {
			const body = "unrelated=one&text=two&also_unrelated=three";
			const { rot13Requests } = await simulatePostAsync({ body });

			assert.deepEqual(rot13Requests, [{
				port: IRRELEVANT_PORT,
				text: "two",
			}]);
		});

		it("logs warning when form field not found (and treats request like GET)", async () => {
			const { response, logOutput } = await simulatePostAsync({ body: "" });
			assert.deepEqual(response, wwwView.homePage());
			assert.deepEqual(logOutput, [{
				...PARSE_LOG_BOILERPLATE,
				details: "'text' form field not found",
				body: "",
			}]);
		});

		it("logs warning when duplicated form field found (and treats request like GET)", async () => {
			const body = "text=one&text=two";
			const { response, logOutput } = await simulatePostAsync({ body });

			assert.deepEqual(response, wwwView.homePage());
			assert.deepEqual(logOutput, [{
				...PARSE_LOG_BOILERPLATE,
				details: "multiple 'text' form fields found",
				body,
			}]);
		});

	});


	describe("ROT-13 service edge cases (TO DO)", () => {

		it("fails gracefully, and logs error, when service returns error", async () => {
			const rot13Client = Rot13Client.createNull([{ error: "my_error" }]);
			const { response, logOutput } =
				await simulatePostAsync({ body: "text=my_text", rot13Client, rot13Port: 9999 });

			assert.deepEqual(response, wwwView.homePage("ROT-13 service failed"));
			assert.deepEqual(logOutput, [{
				alert: Log.EMERGENCY,
				message: "ROT-13 service error in POST /",
				error: "Error: Unexpected status from ROT-13 service\n" +
					"Host: localhost:9999\n" +
					"Endpoint: /rot13/transform\n" +
					"Status: 500\n" +
					"Headers: {}\n" +
					"Body: my_error",
			}]);
		});

		it("fails gracefully, and logs error, when service times out");

	});

});

async function simulateGetAsync() {
	ensure.signature(arguments, []);

	const controller = HomePageController.createNull();
	const response = await controller.getAsync(HttpRequest.createNull(), WwwConfig.createNull());

	return { response };
}

async function simulatePostAsync({
	body,
	rot13Client = Rot13Client.createNull(),
	rot13Port = IRRELEVANT_PORT,
}) {
	ensure.signature(arguments, [{
		body: String,
		rot13Client: [ undefined, Rot13Client ],
		rot13Port: [ undefined, Number ]
	}]);

	const rot13Requests = rot13Client.trackRequests();
	const controller = HomePageController.createNull({ rot13Client });
	const log = Log.createNull();
	const logOutput = log.trackOutput();
	const wwwConfig = WwwConfig.createNull({ rot13ServicePort: rot13Port, log });

	const request = HttpRequest.createNull({ body });
	const response = await controller.postAsync(request, wwwConfig);

	return {
		response,
		rot13Requests,
		logOutput,
	};
}
