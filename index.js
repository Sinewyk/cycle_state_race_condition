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

const split = (whatToSplit, stream) =>
	stream
		.map(x => x[whatToSplit])
		.filter(x => !!x)
		.flatten();

function Atom(sources) {
	const count$ = sources.time.periodic(1);

	const toSplit$ = count$
		.compose(sampleCombine(sources.state.stream))
		.map(([time, state]) => {
			return {
				console: xs.of(String(state.id)),
				state: xs.of(prevState => {
					if (prevState !== state) {
						console.log('previous in reducer ?', prevState);
						console.log('currently in outer', state);
						throw new Error('race condition ?');
					}
					return {
						...prevState,
						time
					};
				})
			};
		});

	return {
		state: split('state', toSplit$),
		console: split('console', toSplit$)
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

const { run } = setup(withState(main), drivers);

const dispose = run();

// Let's suppose that if we didn't have a race condition under 1 second
// it won't ever happen ... not super proud of that proof but meh
setTimeout(() => {
	dispose();
	// why is it not stopping here by the way
	// all listeners should have been cleaned up
	// we also got ourselves a memory leak :'( ?
	process.exit(0);
}, 1000);
