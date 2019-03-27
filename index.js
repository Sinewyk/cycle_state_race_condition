const xs = require('xstream').default;
const isolate = require('@cycle/isolate').default;
const { setup } = require('@cycle/run');
const { withState, makeCollection } = require('@cycle/state');
const { timeDriver } = require('@cycle/time');
const sampleCombine = require('xstream/extra/sampleCombine').default;

const drivers = {
	init: () => xs.from([1, 2]),
	console: () => xs.never(),
	time: timeDriver
};

function Atom(sources) {
	const count$ = sources.time.periodic(1);

	const reducer$ = count$
		.compose(sampleCombine(sources.state.stream))
		.map(([time, state]) => prevState => {
			if (prevState !== state) {
				console.log('previous in reducer ?', prevState);
				console.log('currently in outer', state);
				throw new Error('race condition ?');
			}
			return {
				...prevState,
				time
			};
		});

	return {
		state: reducer$
	};
}

const Atoms = makeCollection({
	item: Atom,
	itemKey: state => state.id,
	itemScope: key => key,
	collectSinks: instances => {
		return {
			state: instances.pickMerge('state'),
			console: instances.pickMerge('console')
		};
	}
});

function main(sources) {
	const initReducer$ = sources.init
		.fold((acc, data) => [...acc, { id: data }], [])
		.last()
		.map(initState => () => ({ atoms: initState }));

	const { init, ...others } = sources;

	const atomSinks = isolate(Atoms, 'atoms')(others);

	return {
		state: xs.merge(initReducer$, atomSinks.state),
		console: atomSinks.console
	};
}

const { run, sources } = setup(withState(main), drivers);

sources.state.stream.debug().addListener({
	next: () => {},
	error: err => {
		console.error(err);
		process.exit(1);
	}
});

run();
