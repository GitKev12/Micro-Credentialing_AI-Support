/**
 * A failed request, read for everything worth saying about it.
 *
 * Its own module because it is a rule rather than a piece of any one API
 * client: it knows what an axios rejection looks like and nothing else, so it
 * can be read — and tested — without pulling in the request layer or the
 * session. The screens that show a failure import it from here, which also
 * means a test that stands in for a service still gets the real reader.
 *
 * Every refusal in this API is something the person can act on — open the
 * class the paper belongs to, ask an admin, start the database — so the
 * server's own sentence is worth far more than a status code. Every error
 * response carries one, in `message`, without exception.
 *
 * `offline` is the distinction this was missing. Axios leaves `response`
 * undefined when the request never reached the server, and that is the one
 * case where "check your connection" is a true thing to tell somebody.
 * Without it every screen had to guess, and they all guessed the same way:
 * they blamed the network, including for the four different 404s and the 503
 * that say exactly what is wrong.
 *
 * `status` rides along because some refusals cannot be retried. A paper that
 * belongs to another class will still belong to it in ten seconds, and
 * offering a Try again button for that is a promise the screen cannot keep.
 *
 * @param error    the rejection an axios call threw
 * @param fallback what to say when the server refused but said nothing
 * @returns {{ message: string, status: number|null, offline: boolean }}
 */
export function readError(error, fallback) {
  if (!error?.response) {
    return {
      message: "Couldn't reach the server. Check your connection and try again.",
      status: null,
      offline: true
    };
  }

  return {
    message: error.response.data?.message ?? fallback,
    status: error.response.status,
    offline: false
  };
}
