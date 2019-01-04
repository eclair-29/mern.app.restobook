const express = require('express');
const router = express.Router();

const Payment = require('../../models/Payment');
const Reservation = require('../../models/Reservation');
const Diner = require('../../models/Diner');
const Table = require('../../models/Table');

// # route: GET /api/v.1/reservations?page=1&limit=20
// # desc: fetch all reservations from the db with pagination
// # access: private
router.get('/', (req, res) => {
    const { page, limit, sort } = req.query;
    const paginationOptions = {
        page: parseInt(page) || 1,
        select: '-tables -__v',
        populate: { path: 'diner', select: 'fname lname email phone' },
        limit: parseInt(limit) || 20,
        sort: sort || { dateReserved: -1 }
    };

    Reservation.paginate({}, paginationOptions)
        .then(docs => {
            console.log(`Found ${docs.docs.length} reservations`);
            res.json(docs);
        })
});

// # route: GET /api/v.1/reservations/:id
// # desc: fetch reservation info from the db
// # access: private
router.get('/:id', (req, res) => {
    Reservation.findOne({
         _id: req.params.id
    }, {
        __v: 0
    })
        .populate({
            path: 'diner',
            select: '-reservations -__v'
        })
        .populate({
            path: 'tables',
            select: '-reservations -__v'
        })
        .populate({
            path: 'payment',
            select: '-guestsCount -__v'
        })
        .then(doc => {
            console.log(`Fetched one reservation id: ${doc._id}`);
            res.json(doc);
        })
});

// # route: PUT /api/v.1/reservations/:id
// # desc: edit/update a reservation from the db
// # access: private
router.put('/:id', (req, res) => {
    const updateReservation = () => {
        return Reservation.updateOne({
            _id:req.params.id
        }, req.body)
            .then(doc => doc)
    }

    const findRef = () => {
        return Reservation.findOne({
            _id: req.params.id
        }, {
            tables: 0,
            __v: 0
        })
            .populate({ path: 'diner', select: '-reservations -__v' })
            .then(doc => {
                console.log(`Update one reservation id: ${doc._id}`);
                res.json(doc);
            })
    }

    return updateReservation()
        .then(findRef);
});

// # route: DELETE /api/v.1/reservations/:id
// # desc: remove/delete a reservation from the db
// # access: private
router.delete('/:id', (req, res) => {
   const updateDinerReservation = () => {
       return Diner.update({
           reservations: req.params.id
       }, {
           $pull: { reservations: req.params.id },
           $inc: { reservationCount: -1 }
       }).then(doc => doc);
   }

   const removeDinerReservation = () => {
       return Reservation.deleteOne({ _id: req.params.id })
        .then(doc => {
            console.log(`Remove one reservation id: ${req.params.id}`);
            res.json(doc);
        })
   }

   return updateDinerReservation()
    .then(removeDinerReservation);
});

// # route: PUT /api/v.1/reservations/:id/tables
// # desc: update reservation tables from the db
// # access: private
router.put('/:id/tables', (req, res) => {
    const addTableSet = () => {
        return Reservation.updateOne({
            _id: req.params.id
        }, {
            $addToSet: { tables: req.body },
            $inc: { tableCount: req.body.length },
            $set: { status: 'pending' }
        }).then(doc => doc);
    }

    const updateTableState = () => {
        return Table.updateMany({
            _id: { $in: req.body }
        }, {
            $addToSet: { reservations: req.params.id },
            $inc: { reservationCount: 1 }
        }).then(docs => docs);
    }

    const findRef = () => {
        return Reservation.findOne({ _id: req.params.id }, { __v: 0 })
            .populate({
                path: 'diner',
                select: 'fname lname email phone'
            })
            .populate({
                path: 'tables',
                select: '-reservations -__v'
            })
            .then(doc => {
                console.log(`Update tables for a reservation id: ${doc._id}`);
                res.json(doc);
            })
    }

    return addTableSet()
        .then(updateTableState)
        .then(findRef);
});

// # route: POST /api/v.1/reservations/:id/payment
// # desc: add a payment details for a ref reservation
// # access: private
router.post('/:id/payment', (req, res) => {
    const findRef = () => {
        return Reservation.findOne({ _id: req.params.id })
            .then(doc => doc);
    }

    const savePayment = doc => {
        const newPayment = new Payment({
            _id: req.params.id,
            dateOfPayment: req.body.dateOfPayment,
            guestsCount: doc.guestsCount,
            ...req.body
        });

        return newPayment.save()
            .then(doc => doc);
    };

    const calculateTotalFee = doc => {
        return Payment.updateOne({
            _id: doc._id
        }, {
            totalAmount: doc.guestsCount * doc.chargePerHead,
        }).then(doc => doc);
    }

    const findPayment = doc => {
        return Payment.findOne({ _id: req.params.id})
            .then(doc => doc);
    }

    const calculateDepositFee = doc => {
        const computationA = doc.totalAmount * doc.depositPercentage;
        const computationB = doc.totalAmount - computationA;

        return Payment.updateOne({
            _id: req.params.id
        }, {
            depositFee: computationB
        }).then(doc => doc);
    }

    const updateRef = doc =>  {
        return Reservation.updateOne({
            _id: req.params.id
        }, {
            status: 'confirmed',
            $set: { payment: req.params.id }
        }).then(doc => doc)
    }

    const populatePayment = () => {
        return Reservation.findOne({
            _id: req.params.id
        }, {
            tables: 0,
            __v: 0
        })
            .populate({ path: 'diner', select: '-dateRegistered -reservations -__v' })
            .populate({ path: 'payment', select: '-guestsCount -__v' })
            .then(doc => {
                console.log(`Save one reservation payment id: ${doc._id}`);
                res.json(doc);
            })
    }

    return findRef()
        .then(savePayment)
        .then(calculateTotalFee)
        .then(findPayment)
        .then(calculateDepositFee)
        .then(updateRef)
        .then(populatePayment);
});

module.exports = router;
